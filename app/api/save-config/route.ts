import { NextRequest, NextResponse } from 'next/server';
import db, { generateId, stringifyJson } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { department, botName, systemPrompt, rules, transcripts } = body;

    // Create or get bot by name + department combination
    let botId: string;
    const existingBot = db.prepare('SELECT id FROM bots WHERE name = ? AND department = ? LIMIT 1').get(botName, department) as { id: string } | undefined;
    
    if (existingBot) {
      botId = existingBot.id;
    } else {
      botId = generateId();
      db.prepare('INSERT INTO bots (id, name, department) VALUES (?, ?, ?)').run(botId, botName, department);
    }

    // Create prompt version
    const promptVersionId = generateId();
    const latestVersion = db.prepare('SELECT MAX(version) as max_version FROM prompt_versions WHERE bot_id = ?').get(botId) as { max_version: number | null } | undefined;
    const nextVersion = (latestVersion?.max_version ?? 0) + 1;
    
    // Set all previous versions to not live
    db.prepare('UPDATE prompt_versions SET is_live = 0 WHERE bot_id = ?').run(botId);
    
    db.prepare('INSERT INTO prompt_versions (id, bot_id, version, body, is_live) VALUES (?, ?, ?, ?, 1)').run(
      promptVersionId,
      botId,
      nextVersion,
      systemPrompt
    );

    // Save rules
    db.prepare('DELETE FROM rules WHERE bot_id = ?').run(botId);
    const rulesArray = Array.isArray(rules) ? rules : [rules];
    for (const rule of rulesArray) {
      const ruleId = generateId();
      db.prepare('INSERT INTO rules (id, bot_id, kind, body) VALUES (?, ?, ?, ?)').run(
        ruleId,
        botId,
        'hard',
        rule
      );
    }

    // Save transcripts
    db.prepare('DELETE FROM transcripts WHERE bot_id = ?').run(botId);
    const transcriptsArray = Array.isArray(transcripts) ? transcripts : [transcripts];
    for (const transcript of transcriptsArray) {
      const transcriptId = generateId();
      db.prepare('INSERT INTO transcripts (id, bot_id, body) VALUES (?, ?, ?)').run(
        transcriptId,
        botId,
        transcript
      );
    }

    return NextResponse.json({ success: true, botId, promptVersionId });
  } catch (error) {
    console.error('Error saving config:', error);
    return NextResponse.json({ success: false, error: 'Failed to save configuration' }, { status: 500 });
  }
}
