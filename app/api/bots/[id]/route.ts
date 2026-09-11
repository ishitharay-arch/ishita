import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';

/**
 * PUT /api/bots/[id]
 * Body: { name?, useCase?, department?, prd?, systemPrompt? }
 *
 * If systemPrompt differs from the current live version, a NEW prompt version
 * is created and marked live rather than overwriting the old one. That is the
 * point of an eval platform — you need the old version to compare against.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(id) as any;
    if (!bot) {
      return NextResponse.json({ success: false, error: `Bot ${id} not found` }, { status: 404 });
    }

    const name = body.name !== undefined ? String(body.name).trim() : bot.name;
    const department = body.department !== undefined ? String(body.department).trim() : bot.department;
    const useCase = body.useCase !== undefined ? String(body.useCase).trim() : bot.use_case;
    const prd = body.prd !== undefined ? String(body.prd).trim() : bot.prd;

    if (!name) {
      return NextResponse.json({ success: false, error: 'Bot name is required.' }, { status: 400 });
    }

    const clash = db.prepare('SELECT id FROM bots WHERE name = ? AND id != ?').get(name, id);
    if (clash) {
      return NextResponse.json({ success: false, error: `Another bot is already named "${name}".` }, { status: 409 });
    }

    let newPromptVersion: number | null = null;

    const tx = db.transaction(() => {
      db.prepare('UPDATE bots SET name = ?, department = ?, use_case = ?, prd = ? WHERE id = ?')
        .run(name, department, useCase, prd, id);

      if (body.systemPrompt !== undefined) {
        const incoming = String(body.systemPrompt).trim();
        const current = db
          .prepare('SELECT body, version FROM prompt_versions WHERE bot_id = ? ORDER BY version DESC LIMIT 1')
          .get(id) as { body: string; version: number } | undefined;

        if (incoming && incoming !== (current?.body || '').trim()) {
          const nextVersion = (current?.version || 0) + 1;
          db.prepare('UPDATE prompt_versions SET is_live = 0 WHERE bot_id = ?').run(id);
          db.prepare(
            "INSERT INTO prompt_versions (id, bot_id, version, body, is_live, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))"
          ).run(generateId(), id, nextVersion, incoming);
          newPromptVersion = nextVersion;
        }
      }
    });
    tx();

    return NextResponse.json({ success: true, id, newPromptVersion });
  } catch (error) {
    console.error('Error updating bot:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/bots/[id]
 *
 * Refuses if the bot has test cases, patterns or runs attached, unless
 * ?force=true. Silently cascading would destroy eval history.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const force = request.nextUrl.searchParams.get('force') === 'true';

    const bot = db.prepare('SELECT id, name FROM bots WHERE id = ?').get(id) as { id: string; name: string } | undefined;
    if (!bot) {
      return NextResponse.json({ success: false, error: `Bot ${id} not found` }, { status: 404 });
    }

    const counts = {
      testCases: (db.prepare('SELECT COUNT(*) AS n FROM test_cases WHERE bot_id = ?').get(id) as { n: number }).n,
      patterns: (db.prepare('SELECT COUNT(*) AS n FROM error_patterns WHERE bot_id = ?').get(id) as { n: number }).n,
      runs: (db.prepare('SELECT COUNT(*) AS n FROM runs WHERE bot_id = ?').get(id) as { n: number }).n,
      prompts: (db.prepare('SELECT COUNT(*) AS n FROM prompt_versions WHERE bot_id = ?').get(id) as { n: number }).n
    };

    const attached = counts.testCases + counts.patterns + counts.runs;

    if (attached > 0 && !force) {
      return NextResponse.json(
        {
          success: false,
          error: `${bot.name} has ${counts.testCases} test cases, ${counts.patterns} error patterns and ${counts.runs} runs attached. Deleting it would remove all of them.`,
          counts,
          needsForce: true
        },
        { status: 409 }
      );
    }

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM test_cases WHERE bot_id = ?').run(id);
      db.prepare('DELETE FROM error_patterns WHERE bot_id = ?').run(id);
      db.prepare('DELETE FROM prompt_versions WHERE bot_id = ?').run(id);
      db.prepare('DELETE FROM bots WHERE id = ?').run(id);
      // runs and results are left in place so eval history stays auditable
    });
    tx();

    return NextResponse.json({ success: true, id, counts });
  } catch (error) {
    console.error('Error deleting bot:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
