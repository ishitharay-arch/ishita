import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET /api/stats?botId=...
 *
 * Every number is computed from the database and scoped to one bot.
 * botId is required — an unscoped total labelled with one bot's name is
 * worse than no number at all.
 *
 * Note on counting: auto-grade writes one `runs` row per call, so there is
 * no batch concept in the schema. "Recent calls" is therefore a fixed-size
 * window over the newest results, not a bulk session.
 */

const RECENT_WINDOW = 30;

export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get('botId');

    const bots = db.prepare(
      'SELECT id, name FROM bots ORDER BY name'
    ).all() as Array<{ id: string; name: string }>;

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

    const testCasesCount = (db
      .prepare('SELECT COUNT(*) AS n FROM test_cases WHERE bot_id = ?')
      .get(bot.id) as { n: number }).n;

    const activePatternsCount = (db
      .prepare('SELECT COUNT(*) AS n FROM error_patterns WHERE bot_id = ? AND active = 1')
      .get(bot.id) as { n: number }).n;

    // results has no bot_id — the run is the authoritative owner.
    const resultsCount = (db.prepare(`
      SELECT COUNT(*) AS n FROM results r
      JOIN runs ru ON ru.id = r.run_id
      WHERE ru.bot_id = ?
    `).get(bot.id) as { n: number }).n;

    // All-time pass rate on the live prompt version. This is the number that
    // means something across the whole history, unlike a rolling window.
    const livePrompt = db.prepare(`
      SELECT id, version, created_at FROM prompt_versions
      WHERE bot_id = ?
      ORDER BY is_live DESC, CAST(version AS INTEGER) DESC
      LIMIT 1
    `).get(bot.id) as { id: string; version: number; created_at: string } | undefined;

    let livePromptStats: any = null;
    if (livePrompt) {
      const row = db.prepare(`
        SELECT COUNT(*) AS total, SUM(r.passed) AS passed
        FROM results r
        JOIN runs ru ON ru.id = r.run_id
        WHERE ru.bot_id = ? AND ru.prompt_version_id = ?
      `).get(bot.id, livePrompt.id) as { total: number; passed: number | null };

      livePromptStats = {
        version: livePrompt.version,
        total: row.total,
        passed: row.passed ?? 0,
        passRate: row.total ? ((row.passed ?? 0) / row.total) * 100 : null
      };
    }

    // Fixed-size recent window, scoped to this bot.
    const recent = db.prepare(`
      SELECT r.id, r.passed, r.failures, r.test_case_id, ru.started_at
      FROM results r
      JOIN runs ru ON ru.id = r.run_id
      WHERE ru.bot_id = ?
      ORDER BY r.rowid DESC
      LIMIT ?
    `).all(bot.id, RECENT_WINDOW) as any[];

    let recentWindow: any = null;
    const failureCounts: Record<string, number> = {};

    if (recent.length > 0) {
      const passed = recent.filter(r => r.passed).length;

      for (const r of recent) {
        let failures: string[] = [];
        try { failures = JSON.parse(r.failures || '[]'); } catch { failures = []; }
        for (const f of failures) {
          const parts = f.split(':');
          const key = parts.length >= 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : f;
          failureCounts[key] = (failureCounts[key] || 0) + 1;
        }
      }

      recentWindow = {
        count: recent.length,
        passed,
        failed: recent.length - passed,
        passRate: (passed / recent.length) * 100,
        gradedAt: recent[0].started_at || null
      };
    }

    const topFailures = Object.entries(failureCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Test cases with no gradeable rules — a call matched to one of these
    // passes without being checked against anything.
    const specs = db
      .prepare('SELECT id, spec FROM test_cases WHERE bot_id = ?')
      .all(bot.id) as { id: string; spec: string }[];

    let unruledCount = 0;
    const unruledIds: string[] = [];
    for (const row of specs) {
      try {
        const s = JSON.parse(row.spec);
        const rules =
          (s.must_say || []).length +
          (s.must_not_say || []).length +
          (s.expected_tools || []).length +
          (s.expect_terminal_state ? 1 : 0);
        if (rules === 0) { unruledCount++; unruledIds.push(row.id); }
      } catch {
        unruledCount++; unruledIds.push(row.id);
      }
    }

    return NextResponse.json({
      success: true,
      bots,
      stats: {
        botId: bot.id,
        botName: bot.name,
        testCasesCount,
        activePatternsCount,
        resultsCount,
        unruledCount,
        unruledIds,
        livePromptStats,
        recentWindow,
        recentWindowSize: RECENT_WINDOW,
        topFailures,
        activePrompt: livePrompt
          ? { version: livePrompt.version, createdAt: livePrompt.created_at }
          : null
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
