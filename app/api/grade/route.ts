import { NextRequest, NextResponse } from 'next/server';
import db, { generateId, stringifyJson, parseJson } from '@/lib/db';
import { gradeTranscript, parseTranscript, type SoftRule } from '@/lib/grade';
import { gradeSoftRules } from '@/lib/gradeSoft';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { botId, botName, testCaseId, transcriptText } = body;

    // Get test case spec
    const testCase = db.prepare('SELECT spec FROM test_cases WHERE id = ?').get(testCaseId) as { spec: string } | undefined;
    
    if (!testCase) {
      return NextResponse.json({ success: false, error: 'Test case not found' }, { status: 404 });
    }

    const spec = JSON.parse(testCase.spec);

    // Parse transcript
    const transcript = parseTranscript(transcriptText);

    // Extract tool response values (simulated - in real implementation this would come from actual tool calls)
    const toolResponseValues: string[] = [];
    transcript.forEach(turn => {
      if (turn.speaker === 'TOOL') {
        // Extract any identifiers from tool responses
        const responseText = turn.text;
        const matches = responseText.match(/\b(?:TKT|APT)-\w+\b/gi);
        if (matches) {
          toolResponseValues.push(...matches);
        }
      }
    });

    // Grade the transcript (hard rules)
    const result = gradeTranscript(transcript, spec, toolResponseValues);

    // Load soft rules for this bot
    const softRules = db.prepare(`
      SELECT id, name, body as description FROM rules 
      WHERE bot_id = ? AND kind = 'soft' AND active = 1
    `).all(botId) as Array<{ id: string; name: string; description: string }>;

    // Grade soft rules if any exist
    let softScores;
    if (softRules.length > 0) {
      try {
        softScores = await gradeSoftRules(transcript, softRules, spec);
      } catch (error) {
        console.error('Error grading soft rules:', error);
        softScores = [];
      }
    }

    // Create a temporary run for this manual grade
    const runId = generateId();
    const latestPrompt = db.prepare('SELECT id FROM prompt_versions WHERE bot_id = ? ORDER BY version DESC LIMIT 1').get(botId) as { id: string } | undefined;
    db.prepare(`
      INSERT INTO runs (id, bot_id, prompt_version_id, status, bot_model, judge_model, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      botId,
      latestPrompt?.id || generateId(), // Use latest prompt version or a placeholder
      'completed',
      botName || 'Unknown',
      'manual',
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Save the result
    const resultId = generateId();
    db.prepare(`
      INSERT INTO results (id, run_id, test_case_id, passed, failures, soft_scores, transcript, tools_called)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resultId,
      runId,
      testCaseId,
      result.passed ? 1 : 0,
      stringifyJson(result.failures),
      stringifyJson(softScores || []),
      stringifyJson(transcript),
      stringifyJson(toolResponseValues)
    );

    return NextResponse.json({
      success: true,
      result: {
        passed: result.passed,
        failures: result.failures,
        softScores: softScores || [],
        runId,
        resultId
      }
    });
  } catch (error) {
    console.error('Error grading transcript:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
