import { NextRequest, NextResponse } from 'next/server';
import db, { parseJson } from '@/lib/db';

/**
 * GET /api/grade-data?botId=...
 *
 * `bots` always returns, so the page can populate its bot dropdown on load.
 * `testCases` returns only for the requested bot — no botId means an empty
 * list, never every bot's cases.
 */
export async function GET(request: NextRequest) {
  try {
    const bots = db.prepare(
      'SELECT id, name, department FROM bots ORDER BY name'
    ).all() as Array<{ id: string; name: string; department: string }>;

    const botId = request.nextUrl.searchParams.get('botId');

    // No bot selected yet: hand back the list and nothing else. Failing
    // closed here is the point — an unscoped list looks plausible and is wrong.
    if (!botId) {
      return NextResponse.json({ bots, botId: null, testCases: [] });
    }

    const bot = bots.find(b => b.id === botId);
    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}`, bots },
        { status: 404 }
      );
    }

    const testCases = db.prepare(`
      SELECT id, bot_id, spec, approved_by, approved_at
      FROM test_cases
      WHERE bot_id = ?
      ORDER BY id
    `).all(bot.id) as Array<{
      id: string
      bot_id: string
      spec: string
      approved_by: string | null
      approved_at: string | null
    }>;

    const parsedTestCases = testCases
      .map(tc => ({ ...tc, spec: parseJson(tc.spec) }))
      .filter(tc => tc.spec !== null);

    return NextResponse.json({
      bots,
      botId: bot.id,
      botName: bot.name,
      testCases: parsedTestCases
    });
  } catch (error) {
    console.error('Error fetching grade data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch grade data' },
      { status: 500 }
    );
  }
}