import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';

/**
 * GET /api/prompts?botId=...
 *
 * Returns every prompt version for a bot, newest first, each with the eval
 * results recorded against it. runs.prompt_version_id is what links them —
 * that is what makes "did this prompt change help?" answerable.
 */
export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get('botId');

    const bot = botId
      ? (db.prepare('SELECT id, name FROM bots WHERE id = ? OR name = ? LIMIT 1').get(botId, botId) as { id: string; name: string } | undefined)
      : (db.prepare('SELECT id, name FROM bots LIMIT 1').get() as { id: string; name: string } | undefined);

    if (!bot) {
      return NextResponse.json({ success: true, versions: [], bot: null });
    }

    const rows = db
      .prepare('SELECT id, version, body, is_live, created_at FROM prompt_versions WHERE bot_id = ? ORDER BY version DESC')
      .all(bot.id) as any[];

    const versions = rows.map(r => {
      const stats = db
        .prepare(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN res.passed = 1 THEN 1 ELSE 0 END) AS passed
             FROM results res
             JOIN runs ru ON ru.id = res.run_id
            WHERE ru.prompt_version_id = ?`
        )
        .get(r.id) as { total: number; passed: number | null };

      const lastRun = db
        .prepare('SELECT started_at FROM runs WHERE prompt_version_id = ? ORDER BY started_at DESC LIMIT 1')
        .get(r.id) as { started_at: string } | undefined;

      const total = stats.total || 0;
      const passed = stats.passed || 0;

      return {
        id: r.id,
        version: r.version,
        body: r.body,
        isLive: !!r.is_live,
        createdAt: r.created_at,
        lineCount: String(r.body || '').split('\n').length,
        charCount: String(r.body || '').length,
        gradedCount: total,
        passedCount: passed,
        passRate: total > 0 ? (passed / total) * 100 : null,
        lastGradedAt: lastRun?.started_at || null
      };
    });

    // Runs whose prompt_version_id points at nothing — auto-grade used to
    // invent an id when a bot had no prompt version, so some history is
    // unattributable. Surfaced rather than hidden.
    const orphanRuns = (db
      .prepare(
        `SELECT COUNT(*) AS n FROM runs
          WHERE bot_id = ?
            AND prompt_version_id NOT IN (SELECT id FROM prompt_versions)`
      )
      .get(bot.id) as { n: number }).n;

    return NextResponse.json({
      success: true,
      bot: { id: bot.id, name: bot.name },
      versions,
      orphanRuns
    });
  } catch (error) {
    console.error('Error listing prompt versions:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/prompts
 * Body: { botId, body, setLive? }
 * Creates the next version. Never overwrites an existing one.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { botId, body, setLive = true } = payload;

    if (!body || !String(body).trim()) {
      return NextResponse.json({ success: false, error: 'Prompt body is required.' }, { status: 400 });
    }

    const bot = db.prepare('SELECT id FROM bots WHERE id = ? OR name = ? LIMIT 1').get(botId, botId) as { id: string } | undefined;
    if (!bot) {
      return NextResponse.json({ success: false, error: 'Bot not found' }, { status: 404 });
    }

    const current = db
      .prepare('SELECT version, body FROM prompt_versions WHERE bot_id = ? ORDER BY version DESC LIMIT 1')
      .get(bot.id) as { version: number; body: string } | undefined;

    if (current && String(body).trim() === String(current.body).trim()) {
      return NextResponse.json(
        { success: false, error: `Identical to v${current.version}. Nothing to save.` },
        { status: 409 }
      );
    }

    const nextVersion = (current?.version || 0) + 1;
    const id = generateId();

    const tx = db.transaction(() => {
      if (setLive) db.prepare('UPDATE prompt_versions SET is_live = 0 WHERE bot_id = ?').run(bot.id);
      db.prepare(
        "INSERT INTO prompt_versions (id, bot_id, version, body, is_live, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
      ).run(id, bot.id, nextVersion, String(body).trim(), setLive ? 1 : 0);
    });
    tx();

    return NextResponse.json({ success: true, id, version: nextVersion });
  } catch (error) {
    console.error('Error creating prompt version:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * PUT /api/prompts
 * Body: { id }  — marks that version live.
 *
 * Versions are never edited or deleted. Eval results reference them, and a
 * result whose prompt has changed underneath it is worthless.
 */
export async function PUT(request: NextRequest) {
  try {
    const { id } = await request.json();

    const row = db.prepare('SELECT id, bot_id, version FROM prompt_versions WHERE id = ?').get(id) as
      | { id: string; bot_id: string; version: number }
      | undefined;

    if (!row) {
      return NextResponse.json({ success: false, error: 'Prompt version not found' }, { status: 404 });
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE prompt_versions SET is_live = 0 WHERE bot_id = ?').run(row.bot_id);
      db.prepare('UPDATE prompt_versions SET is_live = 1 WHERE id = ?').run(id);
    });
    tx();

    return NextResponse.json({ success: true, id, version: row.version });
  } catch (error) {
    console.error('Error setting live prompt:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
