import { NextRequest, NextResponse } from 'next/server';
import db, { generateId, stringifyJson } from '@/lib/db';
import { callModel } from '@/lib/models';
import { getModelConfig } from '@/lib/config';

/**
 * POST /api/generate
 * 
 * Input: { botId }
 * Uses Claude to generate test cases based on the bot's prompt, transcripts, and rules.
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

    // Load bot info
    const bot = db.prepare('SELECT id, name, department FROM bots WHERE id = ?').get(botId) as any;
    if (!bot) {
      return NextResponse.json(
        { success: false, error: 'Bot not found' },
        { status: 404 }
      );
    }

    // Load live prompt
    const prompt = db.prepare(`
      SELECT * FROM prompt_versions
      WHERE bot_id = ? AND is_live = 1
      ORDER BY version DESC LIMIT 1
    `).get(botId) as any;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'No live prompt found for this bot' },
        { status: 400 }
      );
    }

    // Load transcripts
    const transcripts = db.prepare(`
      SELECT body FROM transcripts WHERE bot_id = ?
    `).all(botId) as { body: string }[];

    // Load rules
    const rules = db.prepare(`
      SELECT kind, body FROM rules WHERE bot_id = ? AND active = 1
    `).all(botId) as { kind: string; body: string }[];

    // Get model configuration
    const config = getModelConfig();

    // Build the generation prompt
    const systemPrompt = `You are an expert test case generator for voice bots. Your task is to create comprehensive test cases that will validate the bot's behavior across various scenarios.

You will be given:
1. The bot's system prompt
2. Real call transcripts from the bot
3. Testing rules that the bot must follow

Generate test cases in the following JSON format:
[
  {
    "id": "ALIA-001",
    "scenario_type": "happy_path",
    "priority": "P0",
    "contact_uri": "09876543210",
    "fixture_variant": "default",
    "persona": "Calm 34-year-old, clear English, has the appointment ID ready.",
    "goal": "Cancel the lab test appointment on 27 August.",
    "caller_turns": ["hi I want to cancel my lab test", "APT double eight two one three", "yes please cancel it"],
    "expected_tools": ["get_appointment", "cancel_appointment"],
    "must_say": ["cancel"],
    "must_not_say": ["successfully cancelled"],
    "expect_terminal_state": true
  }
]

Scenario types to cover:
- ~40% happy_path: Normal successful interactions
- ~40% edge_cases: Unusual but valid situations drawn from the transcripts
- ~20% adversarial: Difficult scenarios like silence, code-switching, interruptions, backend failures

IMPORTANT REQUIREMENTS:
1. Always include at least one case with "contact_uri" empty (manual-fallback branch)
2. Always include at least one case with "contact_uri" populated (auto-fetch branch)
3. Return ONLY the JSON array, no prose, no markdown fences
4. Make caller_turns realistic but scripted (not simulated by a model)
5. Include appropriate expected_tools for each scenario
6. Set must_say and must_not_say to key phrases that indicate success/failure
7. Set expect_terminal_state to true if the call should end cleanly

Generate 8-12 test cases total.`;

    const userPrompt = `Generate test cases for this voice bot:

BOT: ${bot.name} (${bot.department})

SYSTEM PROMPT:
${prompt.body}

REAL TRANSCRIPTS (${transcripts.length}):
${transcripts.map((t, i) => `--- Transcript ${i + 1} ---\n${t.body}`).join('\n\n')}

RULES TO TEST:
${rules.map(r => `${r.kind.toUpperCase()}: ${r.body}`).join('\n\n')}

Generate test cases now. Return ONLY the JSON array.`;

    // Call the generator model
    const response = await callModel('generator', systemPrompt, [{ role: 'user', content: userPrompt }], config);

    // Strip markdown fences if present
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    // Parse the JSON
    let testCases: any[];
    try {
      testCases = JSON.parse(jsonStr);
    } catch (error) {
      console.error('Failed to parse generated test cases:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to parse generated test cases. The model did not return valid JSON.' },
        { status: 500 }
      );
    }

    // Validate array
    if (!Array.isArray(testCases)) {
      return NextResponse.json(
        { success: false, error: 'Generated response is not an array' },
        { status: 500 }
      );
    }

    // Insert test cases into database (unapproved)
    const insertedIds: string[] = [];
    for (const testCase of testCases) {
      const testCaseId = generateId();
      
      // Ensure required fields
      const spec = {
        id: testCase.id || `AUTO-${insertedIds.length + 1}`,
        scenario_type: testCase.scenario_type || 'happy_path',
        priority: testCase.priority || 'P1',
        contact_uri: testCase.contact_uri || '',
        fixture_variant: testCase.fixture_variant || 'default',
        persona: testCase.persona || 'Unknown persona',
        goal: testCase.goal || 'Unknown goal',
        caller_turns: testCase.caller_turns || [],
        expected_tools: testCase.expected_tools || [],
        must_say: testCase.must_say || [],
        must_not_say: testCase.must_not_say || [],
        expect_terminal_state: testCase.expect_terminal_state ?? true,
      };

      db.prepare(`
        INSERT INTO test_cases (id, bot_id, spec, approved_by, approved_at, created_at)
        VALUES (?, ?, ?, NULL, NULL, datetime('now'))
      `).run(testCaseId, botId, stringifyJson(spec));

      insertedIds.push(testCaseId);
    }

    return NextResponse.json({
      success: true,
      generated: testCases.length,
      testCases,
      insertedIds,
    });
  } catch (error) {
    console.error('Error generating test cases:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Set max duration for this route
export const maxDuration = 60;