import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET /api/agreement?botId=...
 *
 * Two-way: deterministic grader vs human auditor (the original matrix).
 * Three-way: adds Claude's LLM verdict on calls where all three exist.
 */
export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get('botId');

    const bots = db.prepare(
      'SELECT id, name FROM bots ORDER BY name'
    ).all() as { id: string; name: string }[];

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId is required', bots },
        { status: 400 }
      );
    }

    const bot = bots.find(b => b.id === botId);
    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}`, bots },
        { status: 404 }
      );
    }

    // ── Existing two-way matrix (deterministic vs human) ──

    const cells = db.prepare(`
      SELECT cell, COUNT(*) AS n FROM agreement WHERE bot_id = ? GROUP BY cell
    `).all(bot.id) as { cell: string; n: number }[];

    const count = (c: string) => cells.find(x => x.cell === c)?.n ?? 0;

    const matrix = {
      agree_pass: count('agree_pass'),
      agree_fail: count('agree_fail'),
      false_pass: count('false_pass'),
      false_fail: count('false_fail'),
      ungraded: count('ungraded')
    };

    const compared = matrix.agree_pass + matrix.agree_fail +
                     matrix.false_pass + matrix.false_fail;
    const agreed = matrix.agree_pass + matrix.agree_fail;

    // ── False passes (auditor flagged, grader passed) ──

    const falsePasses = db.prepare(`
      SELECT interaction_id, auditor, human_verdict, error_label, severity,
             remarks, test_case_id, started_at
      FROM agreement
      WHERE bot_id = ? AND cell = 'false_pass'
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'major' THEN 1
                      WHEN 'minor' THEN 2 ELSE 3 END,
        started_at DESC
    `).all(bot.id) as any[];

    // ── False fails (grader failed, auditor passed) ──

    const falseFails = db.prepare(`
      SELECT interaction_id, auditor, human_verdict, remarks,
             test_case_id, failures, started_at
      FROM agreement
      WHERE bot_id = ? AND cell = 'false_fail'
      ORDER BY started_at DESC
    `).all(bot.id) as any[];

    // Noisy rules — which grader failure reasons appear on over-flagged calls
    const noisyRules: Record<string, number> = {};
    for (const row of falseFails) {
      let list: string[] = [];
      try { list = JSON.parse(row.failures || '[]'); } catch { list = []; }
      for (const f of list) {
        const key = f.split(':').slice(0, 2).join(':').trim();
        noisyRules[key] = (noisyRules[key] || 0) + 1;
      }
    }

    // ── Uncovered labels ──

    const patternNames = new Set(
      (db.prepare('SELECT name FROM error_patterns WHERE bot_id = ?')
        .all(bot.id) as { name: string }[])
        .map(p => p.name.toLowerCase())
    );

    const labelCounts = db.prepare(`
      SELECT error_label, COUNT(*) AS n
      FROM audit_feedback
      WHERE bot_id = ? AND error_label IS NOT NULL AND error_label <> ''
      GROUP BY error_label ORDER BY n DESC
    `).all(bot.id) as { error_label: string; n: number }[];

    const uncoveredLabels = labelCounts.filter(
      l => !patternNames.has(l.error_label.toLowerCase())
    );

    // ── Human disagreements ──

    const humanDisagreements = db.prepare(`
      SELECT interaction_id, COUNT(DISTINCT verdict) AS verdicts,
             GROUP_CONCAT(auditor || '=' || verdict, ', ') AS detail
      FROM audit_feedback
      WHERE bot_id = ?
      GROUP BY interaction_id
      HAVING verdicts > 1
    `).all(bot.id) as any[];

    // ── Totals ──

    const feedbackTotal = db.prepare(
      'SELECT COUNT(*) n FROM audit_feedback WHERE bot_id = ?'
    ).get(bot.id) as { n: number };

    const gradedTotal = db.prepare(
      'SELECT COUNT(*) n FROM latest_results WHERE bot_id = ?'
    ).get(bot.id) as { n: number };

    // ── Three-way comparison (deterministic vs human vs Claude) ──

    // Find calls that have all three: an agreement row + an LLM verdict
    // Join via interaction_id (llm_verdicts stores it directly, or via runs)
    let threeWay: any[] = [];
    let threeWayStats = {
      total: 0,
      det_agrees_human: 0,
      claude_agrees_human: 0,
      all_agree: 0,
      claude_catches_det_misses: 0,  // Claude agrees with auditor, deterministic doesn't
    };

    try {
      threeWay = db.prepare(`
        SELECT
          a.interaction_id,
          a.cell AS det_cell,
          a.human_verdict,
          a.error_label,
          a.severity,
          a.remarks AS audit_remarks,
          a.test_case_id,
          lv.verdict AS claude_verdict,
          lv.confidence AS claude_confidence,
          lv.failures AS claude_failures,
          lv.summary AS claude_summary,
          lv.remarks AS claude_remarks
        FROM agreement a
        INNER JOIN llm_verdicts lv
          ON lv.interaction_id = a.interaction_id
          AND lv.bot_id = a.bot_id
        WHERE a.bot_id = ? AND a.cell != 'ungraded'
        ORDER BY a.started_at DESC
      `).all(bot.id) as any[];
    } catch {
      // llm_verdicts table might not exist yet or lack interaction_id
      threeWay = [];
    }

    // If direct interaction_id join found nothing, try joining through runs
    if (threeWay.length === 0) {
      try {
        threeWay = db.prepare(`
          SELECT
            a.interaction_id,
            a.cell AS det_cell,
            a.human_verdict,
            a.error_label,
            a.severity,
            a.remarks AS audit_remarks,
            a.test_case_id,
            lv.verdict AS claude_verdict,
            lv.confidence AS claude_confidence,
            lv.failures AS claude_failures,
            lv.summary AS claude_summary,
            lv.remarks AS claude_remarks
          FROM agreement a
          INNER JOIN runs r
            ON r.interaction_id = a.interaction_id
            AND r.bot_id = a.bot_id
          INNER JOIN llm_verdicts lv
            ON lv.run_id = r.id
          WHERE a.bot_id = ? AND a.cell != 'ungraded'
          ORDER BY a.started_at DESC
        `).all(bot.id) as any[];
      } catch {
        threeWay = [];
      }
    }

    // Compute three-way stats
    for (const row of threeWay) {
      threeWayStats.total++;

      const humanFailed = row.human_verdict === 'fail' || row.human_verdict === 'failed';
      const detPassed = row.det_cell === 'false_pass' || row.det_cell === 'agree_pass';
      const detFailed = row.det_cell === 'false_fail' || row.det_cell === 'agree_fail';
      const claudeFailed = row.claude_verdict === 'fail';

      const detAgrees = (humanFailed && detFailed) || (!humanFailed && detPassed);
      const claudeAgrees = (humanFailed && claudeFailed) || (!humanFailed && !claudeFailed);

      if (detAgrees) threeWayStats.det_agrees_human++;
      if (claudeAgrees) threeWayStats.claude_agrees_human++;
      if (detAgrees && claudeAgrees) threeWayStats.all_agree++;
      if (claudeAgrees && !detAgrees) threeWayStats.claude_catches_det_misses++;
    }

    // Parse Claude failures for display
    const threeWayRows = threeWay.map(row => {
      let claudeFailures: any[] = [];
      try { claudeFailures = JSON.parse(row.claude_failures || '[]'); } catch {}
      return {
        ...row,
        claude_failures: claudeFailures,
      };
    });

    return NextResponse.json({
      success: true,
      bots,
      bot,
      matrix,
      compared,
      agreed,
      agreementRate: compared ? (agreed / compared) * 100 : null,
      feedbackRows: feedbackTotal.n,
      gradedCalls: gradedTotal.n,
      falsePasses,
      falseFails,
      noisyRules: Object.entries(noisyRules)
        .map(([rule, n]) => ({ rule, n }))
        .sort((a, b) => b.n - a.n),
      uncoveredLabels,
      humanDisagreements,
      // New: three-way comparison
      threeWay: threeWayRows,
      threeWayStats,
    });
  } catch (error) {
    console.error('Error in agreement:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
