export interface TestCaseSpec {
  id: string
  scenario_type: string
  priority: string
  contact_uri: string
  fixture_variant: string
  persona: string
  goal: string
  caller_turns: string[]
  expected_tools: string[]
  must_say: string[]
  must_not_say: string[]
  expect_terminal_state: boolean
}

export interface SoftRule {
  id: string
  name: string
  description: string
}

export interface SoftScore {
  ruleId: string
  ruleName: string
  score: number // 1-5
  reason: string
}

export interface TranscriptTurn {
  speaker: 'CALLER' | 'BOT' | 'TOOL' | 'SYSTEM'
  text: string
}

interface GradeResult {
  passed: boolean
  failures: string[]
  rulesEvaluated: number
  softScores?: SoftScore[]
}

// Fixed vocabulary. Adding a value here is deliberate; typos are compile errors.
export type RuleName =
  | 'must_say'
  | 'must_not_say'
  | 'tool_order'
  | 'hallucinated_id'
  | 'terminal_state'
  | 'repetition'

// Every failure string is `{testCaseId}: {rule}: {detail}` so the bulk-grade
// page can group on the first two segments.
function fail(testCaseId: string, rule: RuleName, detail: string): string {
  const safeDetail = detail.replace(/:/g, ' -');
  return `${testCaseId}: ${rule}: ${safeDetail}`;
}

export function gradeTranscript(
  transcript: TranscriptTurn[],
  spec: TestCaseSpec,
  toolResponseValues: string[]
): GradeResult {
  const failures: string[] = [];
  let rulesEvaluated = 0;

  // Extract bot speech
  const botSpeech = transcript
    .filter(turn => turn.speaker === 'BOT')
    .map(turn => turn.text)
    .join(' ')
    .toLowerCase();

  // 1. Check must_say phrases appear in bot speech (case-insensitive)
  for (const phrase of spec.must_say) {
    rulesEvaluated++;
    if (!botSpeech.includes(phrase.toLowerCase())) {
      failures.push(fail(spec.id, 'must_say', `missing "${phrase}"`));
    }
  }

  // 2. Check must_not_say phrases don't appear in bot speech
  for (const phrase of spec.must_not_say) {
    rulesEvaluated++;
    if (botSpeech.includes(phrase.toLowerCase())) {
      failures.push(fail(spec.id, 'must_not_say', `found "${phrase}"`));
    }
  }

  const hasTool = transcript.some(turn => turn.speaker === 'TOOL');
  if (hasTool) {
    rulesEvaluated++;

    // 3. Check tool call sequence matches expected_tools
    const toolCalls = transcript
      .filter(turn => turn.speaker === 'TOOL')
      .map(turn => {
        // Extract tool name from TOOL turn text
        const match = turn.text.match(/(\w+)\s*->/);
        return match ? match[1] : null;
      })
      .filter((name): name is string => name !== null);

    if (toolCalls.length !== spec.expected_tools.length) {
      failures.push(
        fail(
          spec.id,
          'tool_order',
          `count mismatch - expected ${spec.expected_tools.length}, got ${toolCalls.length}`
        )
      );
    } else {
      for (let i = 0; i < spec.expected_tools.length; i++) {
        if (toolCalls[i] !== spec.expected_tools[i]) {
          failures.push(
            fail(
              spec.id,
              'tool_order',
              `position ${i + 1} - expected "${spec.expected_tools[i]}", got "${toolCalls[i]}"`
            )
          );
        }
      }
    }
  }

  // 4. Check for hallucinated identifiers (TKT- or APT- patterns not in tool responses)
  const identifierPattern = /\b(?:TKT|APT)-\w+\b/gi;
  const botIdentifiers = botSpeech.match(identifierPattern) || [];

  for (const identifier of botIdentifiers) {
    rulesEvaluated++;
    const isInToolResponses = toolResponseValues.some(value =>
      value.toLowerCase().includes(identifier.toLowerCase())
    );
    if (!isInToolResponses) {
      failures.push(fail(spec.id, 'hallucinated_id', `unknown identifier "${identifier}"`));
    }
  }

  // 5. Check terminal state if required
  if (spec.expect_terminal_state && transcript.some(t => t.speaker === 'SYSTEM')) {
    rulesEvaluated++;
    const hasTerminalState = transcript.some(
      turn => turn.speaker === 'SYSTEM' && turn.text.includes('[call ended by bot]')
    );
    if (!hasTerminalState) {
      failures.push(fail(spec.id, 'terminal_state', 'call not ended by bot'));
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    rulesEvaluated
  };
}

export function parseTranscript(transcriptText: string): TranscriptTurn[] {
  const lines = transcriptText.split('\n').filter(line => line.trim());
  const turns: TranscriptTurn[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const speakerMatch = line.match(/^(CALLER|BOT|TOOL|SYSTEM|Assistant|User)[:\]\s]+(.+)$/i);
    if (speakerMatch) {
      let speaker = speakerMatch[1].toUpperCase() as string;
      if (speaker === 'ASSISTANT') speaker = 'BOT';
      if (speaker === 'USER') speaker = 'CALLER';
      const text = speakerMatch[2].trim();
      turns.push({ speaker: speaker as TranscriptTurn['speaker'], text });
    } else {
      if (turns.length > 0) {
        turns[turns.length - 1].text += ' ' + line.trim();
      } else {
        turns.push({ speaker: 'BOT', text: line.trim() });
      }
    }
  }

  return turns;
}