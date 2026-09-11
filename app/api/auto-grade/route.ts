import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';
import { gradeTranscript, parseTranscript } from '@/lib/grade';
import { detectFlow } from '@/lib/auto-detect';
import { runErrorPatterns, statusFor } from '@/lib/error-kb';

export async function POST(request: NextRequest) {
  try {
    const { botId, transcriptText } = await request.json();

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId is required' },
        { status: 400 }
      );
    }
    if (!transcriptText || typeof transcriptText !== 'string') {
      return NextResponse.json(
        { success: false, error: 'transcriptText is required' },
        { status: 400 }
      );
    }

    // Resolve by id only. No name matching, no fallback to "the only bot" —
    // guessing here is what writes results under the wrong bot.
    const bot = db
      .prepare('SELECT id, name FROM bots WHERE id = ?')
      .get(botId) as { id: string; name: string } | undefined;

    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}` },
        { status: 404 }
      );
    }

    // Attribution target. Prefer the live version; fall back to the highest
    // version number. If the bot has no prompt versions we cannot attribute
    // the run, so refuse rather than inventing an id.
    const promptVersion = db.prepare(`
      SELECT id, version FROM prompt_versions
      WHERE bot_id = ?
      ORDER BY is_live DESC, CAST(version AS INTEGER) DESC
      LIMIT 1
    `).get(bot.id) as { id: string; version: number } | undefined;

    if (!promptVersion) {
      return NextResponse.json({
        success: false,
        error: `${bot.name} has no prompt versions. Add one in the Prompt Library before grading.`
      }, { status: 409 });
    }

    const transcript = parseTranscript(transcriptText);

    const botSpeech = transcript
      .filter(t => t.speaker === 'BOT').map(t => t.text).join(' ');
    const callerSpeech = transcript
      .filter(t => t.speaker === 'CALLER').map(t => t.text).join(' ');

        const flow = detectFlow(botSpeech, callerSpeech, bot.id);
    if (!flow) {
      return NextResponse.json({
        success: false,
        error: `No flow rule matched this transcript for ${bot.name}. Pick a test case manually, or add a flow rule.`
      }, { status: 422 });
    }
    const detectedCaseId = flow.testCaseId;

    // Scoped lookup. A test case belonging to another bot must not match.
    const testCase = db.prepare(
      'SELECT * FROM test_cases WHERE id = ? AND bot_id = ?'
    ).get(detectedCaseId, bot.id) as any;

    if (!testCase) {
      return NextResponse.json({
        success: false,
        error: `Detected flow ${detectedCaseId}, but ${bot.name} has no test case with that id`
      }, { status: 404 });
    }

    const spec = JSON.parse(testCase.spec);

    const toolResponseValues: string[] = [];
    transcript.forEach(turn => {
      if (turn.speaker === 'TOOL') {
        const matches = turn.text.match(/\b(?:TKT|APT)-\w+\b/gi);
        if (matches) toolResponseValues.push(...matches);
      }
    });

    const result = gradeTranscript(transcript, spec, toolResponseValues);

    const { failures: patternFailures, patternsEvaluated } =
      runErrorPatterns(transcript, bot.id);
    const regressionFailures = patternFailures.map(f => f.message);
    const status = statusFor(patternFailures.map(f => f.severity));
    const allFailures = [...result.failures, ...regressionFailures];

    const runId = generateId();
    const resultId = generateId();
    const now = new Date().toISOString();

    // One transaction: never leave a run without its result.
    db.transaction(() => {
      db.prepare(`
        INSERT INTO runs (id, bot_id, prompt_version_id, status,
                          bot_model, judge_model, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(runId, bot.id, promptVersion.id, 'completed',
             bot.name, 'auto-detect', now, now);

      db.prepare(`
        INSERT INTO results (id, run_id, test_case_id, passed,
                             failures, transcript, tools_called)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(resultId, runId, testCase.id, allFailures.length === 0 ? 1 : 0,
             JSON.stringify(allFailures), JSON.stringify(transcript),
             JSON.stringify(toolResponseValues));
    })();

    return NextResponse.json({
      success: true,
      result: {
        passed: allFailures.length === 0,
        status,
        failures: allFailures,
        botId: bot.id,
        botName: bot.name,
        promptVersion: promptVersion.version,
        detectedFlow: detectedCaseId,
        detectedScenario: spec.scenario_type,
        detectedDescription: spec.description,
        regressionChecks: regressionFailures,
        patternFailures,
        patternsEvaluated,
        rulesEvaluated: result.rulesEvaluated,
        runId,
        resultId
      }
    });
  } catch (error) {
    console.error('Error in auto-grade:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}