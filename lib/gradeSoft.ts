/**
 * Soft rule grading using Claude (LLM judge).
 * Separated from grade.ts to avoid circular dependencies.
 */

import { callModel } from './models';
import { getModelConfig } from './config';
import type { TranscriptTurn, TestCaseSpec, SoftRule, SoftScore } from './grade';

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

For each soft rule, provide:
- A score from 1-5 (1 = poor, 5 = excellent)
- A one-line reason for the score

Return your response as a JSON array in this format:
[
  {
    "ruleId": "rule_1",
    "ruleName": "Empathy",
    "score": 4,
    "reason": "Bot showed good understanding but could be more comforting"
  }
]

Return ONLY the JSON array, no prose or markdown fences.`;

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

Provide scores and reasons for each rule. Return ONLY the JSON array.`;

  try {
    const response = await callModel('judge', systemPrompt, [{ role: 'user', content: userPrompt }], config);

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

    const scores = JSON.parse(jsonStr);
    
    // Validate structure
    if (!Array.isArray(scores)) {
      console.error('Soft rule grading did not return an array');
      return [];
    }

    return scores.map((score: any) => ({
      ruleId: score.ruleId || 'unknown',
      ruleName: score.ruleName || 'Unknown Rule',
      score: Math.min(5, Math.max(1, score.score || 3)),
      reason: score.reason || 'No reason provided',
    }));
  } catch (error) {
    console.error('Error grading soft rules:', error);
    return [];
  }
}