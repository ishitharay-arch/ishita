/**
 * Soft rule grading using Claude (LLM judge).
 * Separated from grade.ts to avoid circular dependencies.
 */

import { z } from 'zod';
import { callModelStructured } from './models';
import { getModelConfig } from './config';
import type { TranscriptTurn, TestCaseSpec, SoftRule, SoftScore } from './grade';

const SoftScoreSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  score: z.number().int().min(1).max(5),
  reason: z.string(),
});

const SoftScoresSchema = z.array(SoftScoreSchema);

/**
 * Grade soft rules using Claude (LLM judge).
 * This is diagnostic only and does not affect the pass/fail gate.
 */
export async function gradeSoftRules(
  transcript: TranscriptTurn[],
  softRules: SoftRule[],
  testCaseSpec: TestCaseSpec
): Promise<SoftScore[]> {
  if (softRules.length === 0) {
    return [];
  }

  const config = getModelConfig();

  const systemPrompt = `You are an expert judge evaluating voice bot conversations. Your task is to score the bot's performance against soft rules.

Soft rules are qualitative guidelines that don't have simple pass/fail criteria. Examples include:
- Tone and empathy
- Clarity of explanations
- Appropriateness of responses
- Natural conversation flow

For each soft rule, provide a score from 1-5 (1 = poor, 5 = excellent) and a one-line reason for the score.`;

  const transcriptText = transcript
    .map(turn => `${turn.speaker}: ${turn.text}`)
    .join('\n');

  const userPrompt = `Evaluate this conversation against the following soft rules:

TRANSCRIPT:
${transcriptText}

TEST CASE:
${JSON.stringify(testCaseSpec, null, 2)}

SOFT RULES:
${softRules.map(rule => `- ${rule.name}: ${rule.description}`).join('\n')}

Provide a score and reason for each rule listed above.`;

  try {
    const scores = await callModelStructured(
      'judge',
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      config,
      SoftScoresSchema
    );

    return scores;
  } catch (error) {
    console.error('Error grading soft rules:', error);
    return [];
  }
}
