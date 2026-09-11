import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { analyseTranscripts } from '@/lib/analyse';

/**
 * POST /api/analyse
 *
 * Body: { botId: string, calls: [{ callNumber, transcriptText, failed?, detectedFlow? }] }
 *
 * Returns candidate error patterns and test cases for human review.
 * Writes nothing — accepting a candidate goes through the existing
 * POST /api/error-patterns (or the test case endpoint) so the same
 * validation applies to manual and suggested entries alike.
 */
export async function POST(request: NextRequest) {
  try {
    const { botId, calls } = await request.json();

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(calls) || calls.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No calls supplied. Send the transcripts you want analysed.' },
        { status: 400 }
      );
    }

    // Resolve by id only. No name matching, no fallback to "the only bot" —
    // candidates proposed under the wrong bot get accepted into the wrong KB.
    const bot = db
      .prepare('SELECT id, name FROM bots WHERE id = ?')
      .get(botId) as { id: string; name: string } | undefined;

    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}` },
        { status: 404 }
      );
    }

    const result = analyseTranscripts({
      botId: bot.id,
      calls: calls.map((c: any, i: number) => ({
        callNumber: c.callNumber ?? i + 1,
        transcriptText: c.transcriptText || '',
        failed: !!c.failed,
        detectedFlow: c.detectedFlow
      }))
    });

    return NextResponse.json({ success: true, botId: bot.id, botName: bot.name, ...result });
  } catch (error) {
    console.error('Error in analyse:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}