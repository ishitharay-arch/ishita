import { NextRequest, NextResponse } from 'next/server';
import db, { parseJson, stringifyJson } from '@/lib/db';
import { callModel } from '@/lib/models';
import { getModelConfig } from '@/lib/config';

/**
 * POST /api/optimize
 * 
 * Input: { runId }
 * Uses Claude to propose a revised prompt based on failing test cases and their transcripts.
 * Returns the revised prompt as text - does NOT write to prompt_versions (user must save explicitly).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { runId } = body;

    if (!runId) {
      return NextResponse.json(
        { success: false, error: 'runId is required' },
        { status: 400 }
      );
    }

    // Load run information
    const run = db.prepare(`
      SELECT * FROM runs WHERE id = ?
    `).get(runId) as any;

    if (!run) {
      return NextResponse.json(
        { success: false, error: 'Run not found' },
        { status: 404 }
      );
    }

    // Load the current prompt version
    const prompt = db.prepare(`
      SELECT * FROM prompt_versions WHERE id = ?
    `).get(run.prompt_version_id) as any;

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt version not found' },
        { status: 404 }
      );
    }

    // Load all results for this run
    const results = db.prepare(`
      SELECT * FROM results WHERE run_id = ?
    `).all(runId) as any[];

    // Filter for failing results
    const failingResults = results.filter(r => !r.passed);

    if (failingResults.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No failing test cases found in this run' },
        { status: 400 }
      );
    }

    // Load test case specs for failing results
    const failingTestCases = failingResults.map(result => {
      const testCase = db.prepare(`
        SELECT spec FROM test_cases WHERE id = ?
      `).get(result.test_case_id) as { spec: string } | undefined;
      
      return {
        testCaseId: result.test_case_id,
        spec: testCase ? parseJson(testCase.spec) : null,
        failures: parseJson(result.failures) || [],
        transcript: parseJson(result.transcript) || null,
      };
    });

    // Get model configuration
    const config = getModelConfig();

    // Build the optimization prompt
    const systemPrompt = `You are an expert at optimizing voice bot prompts. Your task is to analyze failing test cases and propose improvements to the bot's system prompt.

You will be given:
1. The current system prompt
2. Failing test cases with their specifications
3. The actual transcripts from those test runs
4. The specific failure reasons

Your goal:
- Propose a revised system prompt that fixes the failures
- Maintain behavior that passing test cases depend on
- Be conservative - only change what's necessary
- Keep the same overall structure and tone

Return ONLY the revised system prompt text, no explanations or markdown fences.`;

    const userPrompt = `Optimize this voice bot prompt:

CURRENT SYSTEM PROMPT:
${prompt.body}

FAILING TEST CASES (${failingTestCases.length}):
${failingTestCases.map((tc, i) => `
--- Test Case ${i + 1} ---
Spec: ${JSON.stringify(tc.spec, null, 2)}
Failures: ${JSON.stringify(tc.failures, null, 2)}
Transcript: ${JSON.stringify(tc.transcript, null, 2)}
`).join('\n')}

Propose a revised system prompt that fixes these failures while maintaining existing functionality. Return ONLY the revised prompt text.`;

    // Call the optimizer model
    const revisedPrompt = await callModel('optimizer', systemPrompt, [{ role: 'user', content: userPrompt }], config);

    // Strip markdown fences if present
    let cleanPrompt = revisedPrompt.trim();
    if (cleanPrompt.startsWith('```')) {
      cleanPrompt = cleanPrompt.replace(/^```\w*\n/, '').replace(/```$/, '');
    }
    cleanPrompt = cleanPrompt.trim();

    return NextResponse.json({
      success: true,
      originalPrompt: prompt.body,
      revisedPrompt: cleanPrompt,
      failingCount: failingResults.length,
      totalResults: results.length,
    });
  } catch (error) {
    console.error('Error optimizing prompt:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// Set max duration for this route
export const maxDuration = 60;