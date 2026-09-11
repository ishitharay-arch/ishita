import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET /api/test-cases?botId=...
 * Returns every test case for a bot with its parsed spec.
 * botId is required — without it we return nothing rather than guessing a bot.
 */
export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get('botId');

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId is required' },
        { status: 400 }
      );
    }

    const bot = db
      .prepare('SELECT id, name FROM bots WHERE id = ?')
      .get(botId) as { id: string; name: string } | undefined;

    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}` },
        { status: 404 }
      );
    }

    const rows = db
      .prepare(`SELECT id, bot_id, spec, approved_by, approved_at, created_at
                FROM test_cases WHERE bot_id = ? ORDER BY id`)
      .all(bot.id) as any[];

    const testCases = rows.map(r => {
      let spec: any = {};
      try {
        spec = JSON.parse(r.spec);
      } catch {
        spec = { _parseError: true };
      }
      return { ...r, spec };
    });

    return NextResponse.json({
      success: true,
      botId: bot.id,
      botName: bot.name,
      testCases
    });
  } catch (error) {
    console.error('Error listing test cases:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * POST /api/test-cases
 * Body: { botId, spec: {...}, id? }  — or { botId, cases: [{ spec, id? }, ...] }
 * The bot comes from botId only. A case declaring a different bot is rejected
 * rather than silently rewritten.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId } = body;

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId is required' },
        { status: 400 }
      );
    }

    const bot = db
      .prepare('SELECT id, name FROM bots WHERE id = ?')
      .get(botId) as { id: string; name: string } | undefined;

    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}` },
        { status: 404 }
      );
    }

    // Accept one case or many, so bulk import and manual add share this path.
    const incoming: any[] = Array.isArray(body.cases)
      ? body.cases
      : [{ id: body.id, spec: body.spec }];

    if (incoming.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No test cases supplied.' },
        { status: 400 }
      );
    }

    // Reject rows that name a different bot. Rewriting them to match the
    // selection is how you end up with cases filed under the wrong bot.
    const mismatched = incoming.filter(
      c => c.botId && c.botId !== bot.id
    );
    if (mismatched.length) {
      return NextResponse.json({
        success: false,
        error: `${mismatched.length} of ${incoming.length} cases declare a different bot than ${bot.name}. Nothing was imported.`,
        ids: mismatched.map(c => c.id ?? c.spec?.id ?? '(no id)')
      }, { status: 409 });
    }

    const missingScenario = incoming.filter(c => !c.spec?.scenario_type);
    if (missingScenario.length) {
      return NextResponse.json({
        success: false,
        error: `${missingScenario.length} of ${incoming.length} cases have no scenario_type. Nothing was imported.`,
        ids: missingScenario.map(c => c.id ?? c.spec?.id ?? '(no id)')
      }, { status: 400 });
    }

    // Existing ids for this bot, used both for the series counter and to
    // detect within-batch duplicates.
    const prefix = idPrefixFor(bot.id);
    const existing = db
      .prepare('SELECT id FROM test_cases WHERE bot_id = ?')
      .all(bot.id) as { id: string }[];

    const nums = existing
      .map(r => {
        const m = r.id.match(/(\d+)$/);
        return m ? parseInt(m[1], 10) : NaN;
      })
      .filter(n => !isNaN(n));
    let next = nums.length ? Math.max(...nums) + 1 : 1;

    const assigned: string[] = [];
    const seen = new Set<string>();

    for (const c of incoming) {
      let newId = String(c.id ?? c.spec?.id ?? '').trim();
      if (!newId) {
        newId = `${prefix}-${String(next).padStart(2, '0')}`;
        next += 1;
      }
      if (seen.has(newId)) {
        return NextResponse.json({
          success: false,
          error: `Duplicate id ${newId} within the batch. Nothing was imported.`
        }, { status: 409 });
      }
      seen.add(newId);
      assigned.push(newId);
    }

    // Global clash check, because test_cases.id is the primary key.
    const clashCheck = db.prepare(
      'SELECT id, bot_id FROM test_cases WHERE id = ?'
    );
    const clashes = assigned
      .map(id => clashCheck.get(id) as { id: string; bot_id: string } | undefined)
      .filter(Boolean) as { id: string; bot_id: string }[];

    if (clashes.length) {
      const sameBot = clashes.filter(c => c.bot_id === bot.id);
      const otherBot = clashes.filter(c => c.bot_id !== bot.id);
      const parts: string[] = [];
      if (sameBot.length) {
        parts.push(`already exist for ${bot.name}: ${sameBot.map(c => c.id).join(', ')}`);
      }
      if (otherBot.length) {
        parts.push(`taken by another bot: ${otherBot.map(c => `${c.id} (${c.bot_id})`).join(', ')}`);
      }
      return NextResponse.json({
        success: false,
        error: `Nothing was imported. Ids ${parts.join('; ')}.`
      }, { status: 409 });
    }

    const insert = db.prepare(
      `INSERT INTO test_cases (id, bot_id, spec, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    );

    // All or nothing: a half-imported file is worse than a rejected one.
    db.transaction(() => {
      incoming.forEach((c, i) => {
        const spec = { ...c.spec, id: assigned[i] };
        insert.run(assigned[i], bot.id, JSON.stringify(spec));
      });
    })();

    return NextResponse.json({
      success: true,
      botId: bot.id,
      botName: bot.name,
      imported: assigned.length,
      ids: assigned
    });
  } catch (error) {
    console.error('Error creating test case:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * Id series prefix per bot. Sameeksha keeps the bare PEHC-nn series so the
 * existing 29 cases and the 510 results referencing them stay valid.
 * Every other bot gets its own prefix, otherwise PEHC-01 collides on the
 * primary key the first time a second bot adds a case.
 */
function idPrefixFor(botId: string): string {
  if (botId === 'sameeksha') return 'PEHC';
  return botId.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 12);
}