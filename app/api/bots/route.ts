import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 40);
}

/**
 * GET /api/bots
 * Returns every bot with its live prompt version and counts of the things
 * attached to it, so the list can show whether a bot is actually set up.
 */
export async function GET() {
  try {
    const bots = db
      .prepare('SELECT id, name, department, use_case, prd, created_at FROM bots ORDER BY created_at')
      .all() as any[];

    const enriched = bots.map(b => {
      const prompt = db
        .prepare('SELECT id, version, body, is_live, created_at FROM prompt_versions WHERE bot_id = ? ORDER BY version DESC LIMIT 1')
        .get(b.id) as any;

      const testCases = (db.prepare('SELECT COUNT(*) AS n FROM test_cases WHERE bot_id = ?').get(b.id) as { n: number }).n;
      const patterns = (db.prepare('SELECT COUNT(*) AS n FROM error_patterns WHERE bot_id = ? AND active = 1').get(b.id) as { n: number }).n;
      const runs = (db.prepare('SELECT COUNT(*) AS n FROM runs WHERE bot_id = ?').get(b.id) as { n: number }).n;

      return {
        ...b,
        latestPrompt: prompt
          ? { id: prompt.id, version: prompt.version, body: prompt.body, isLive: !!prompt.is_live, createdAt: prompt.created_at }
          : null,
        testCasesCount: testCases,
        patternsCount: patterns,
        runsCount: runs
      };
    });

    return NextResponse.json({ success: true, bots: enriched });
  } catch (error) {
    console.error('Error listing bots:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/bots
 * Body: { name, useCase, department?, systemPrompt?, prd? }
 *
 * The system prompt is written to prompt_versions as v1 rather than onto the
 * bot row — prompts are versioned, and the eval platform exists to compare
 * versions against each other.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = (body.name || '').trim();
    const useCase = (body.useCase || '').trim();
    const department = (body.department || 'Customer Support').trim();
    const systemPrompt = (body.systemPrompt || '').trim();
    const prd = (body.prd || '').trim();

    if (!name) {
      return NextResponse.json({ success: false, error: 'Bot name is required.' }, { status: 400 });
    }

    let id = slugify(name);
    if (!id) id = generateId();

    const clash = db.prepare('SELECT id FROM bots WHERE id = ? OR name = ?').get(id, name);
    if (clash) {
      return NextResponse.json(
        { success: false, error: `A bot named "${name}" already exists.` },
        { status: 409 }
      );
    }

    const insertBot = db.prepare(
      "INSERT INTO bots (id, name, department, use_case, prd, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    );
    const insertPrompt = db.prepare(
      "INSERT INTO prompt_versions (id, bot_id, version, body, is_live, created_at) VALUES (?, ?, 1, ?, 1, datetime('now'))"
    );

    const tx = db.transaction(() => {
      insertBot.run(id, name, department, useCase, prd);
      if (systemPrompt) {
        insertPrompt.run(generateId(), id, systemPrompt);
      }
    });
    tx();

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error creating bot:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
