import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET /api/transcripts
 *   ?botId=...            filter by bot
 *   &resultId=...         return one full transcript
 *   &verdict=pass|fail    filter by graded outcome
 *   &flow=PEHC-21         filter by detected test case
 *   &q=text               search inside failures / flow id
 *   &runId=...            only one run
 *   &limit=&offset=       paging (default 50)
 *
 * The list response deliberately omits transcript bodies — 480 rows of full
 * conversation is far too much to ship to the browser at once. Bodies come
 * back one at a time via resultId.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const resultId = sp.get('resultId');

    // ---- single transcript ----
    if (resultId) {
      const row = db
        .prepare(
          `SELECT r.id, r.run_id, r.test_case_id, r.passed, r.failures, r.transcript, r.tools_called,
                  ru.bot_id, ru.bot_model, ru.started_at, ru.interaction_id
             FROM results r
             LEFT JOIN runs ru ON ru.id = r.run_id
            WHERE r.id = ?`
        )
        .get(resultId) as any;

      if (!row) {
        return NextResponse.json({ success: false, error: 'Transcript not found' }, { status: 404 });
      }

      let turns: any[] = [];
      let failures: string[] = [];
      let tools: string[] = [];
      try { turns = JSON.parse(row.transcript || '[]'); } catch { turns = []; }
      try { failures = JSON.parse(row.failures || '[]'); } catch { failures = []; }
      try { tools = JSON.parse(row.tools_called || '[]'); } catch { tools = []; }

      // The first turn is often the export's metadata header, stored as BOT
      // by parseTranscript's no-speaker fallback. Flag it rather than hide it —
      // it is also being fed to the grader as bot speech.
      const headerLike = turns.length > 0 &&
        turns[0].speaker === 'BOT' &&
        /Start:|Duration:|Customer:/i.test(turns[0].text || '');

      let spec: any = null;
      const tc = db.prepare('SELECT spec FROM test_cases WHERE id = ?').get(row.test_case_id) as { spec: string } | undefined;
      if (tc) {
        try { spec = JSON.parse(tc.spec); } catch { spec = null; }
      }

      return NextResponse.json({
        success: true,
        transcript: {
          id: row.id,
          runId: row.run_id,
          testCaseId: row.test_case_id,
          passed: !!row.passed,
          failures,
          tools,
          turns,
          headerLike,
          botModel: row.bot_model,
          startedAt: row.started_at,
          interactionId: row.interaction_id,
          scenarioType: spec?.scenario_type || null,
          description: spec?.description || null
        }
      });
    }

    // ---- list ----
    const botId = sp.get('botId');
    const verdict = sp.get('verdict');
    const flow = sp.get('flow');
    const q = sp.get('q');
    const runId = sp.get('runId');
    const limit = Math.min(parseInt(sp.get('limit') || '50', 10) || 50, 200);
    const offset = parseInt(sp.get('offset') || '0', 10) || 0;

    const where: string[] = [];
    const args: any[] = [];

    if (botId) {
      const bot = db.prepare('SELECT id FROM bots WHERE id = ? OR name = ? LIMIT 1').get(botId, botId) as { id: string } | undefined;
      if (bot) { where.push('ru.bot_id = ?'); args.push(bot.id); }
    }
    if (verdict === 'pass') where.push('r.passed = 1');
    if (verdict === 'fail') where.push('r.passed = 0');
    if (flow) { where.push('r.test_case_id = ?'); args.push(flow); }
    if (runId) { where.push('r.run_id = ?'); args.push(runId); }
    if (q) { where.push('(r.failures LIKE ? OR r.test_case_id LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const total = (db
      .prepare(`SELECT COUNT(*) AS n FROM results r LEFT JOIN runs ru ON ru.id = r.run_id ${whereSql}`)
      .get(...args) as { n: number }).n;

    const rows = db
      .prepare(
        `SELECT r.id, r.run_id, r.test_case_id, r.passed, r.failures,
                LENGTH(r.transcript) AS transcript_size,
                ru.bot_model, ru.started_at, ru.interaction_id
           FROM results r
           LEFT JOIN runs ru ON ru.id = r.run_id
           ${whereSql}
           ORDER BY ru.started_at DESC, r.rowid DESC
           LIMIT ? OFFSET ?`
      )
      .all(...args, limit, offset) as any[];

    const items = rows.map(r => {
      let failures: string[] = [];
      try { failures = JSON.parse(r.failures || '[]'); } catch { failures = []; }
      return {
        id: r.id,
        runId: r.run_id,
        testCaseId: r.test_case_id,
        passed: !!r.passed,
        failureCount: failures.length,
        failures,
        transcriptSize: r.transcript_size,
        botModel: r.bot_model,
        startedAt: r.started_at,
        interactionId: r.interaction_id
      };
    });

    // Distinct flows, for the filter dropdown
    const flows = db
      .prepare('SELECT DISTINCT test_case_id FROM results ORDER BY test_case_id')
      .all()
      .map((r: any) => r.test_case_id)
      .filter(Boolean);

    return NextResponse.json({ success: true, items, total, limit, offset, flows });
  } catch (error) {
    console.error('Error listing transcripts:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
