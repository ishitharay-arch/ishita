import db from '@/lib/db';
import { parseTranscript } from '@/lib/grade';

interface TranscriptTurn {
  speaker: 'CALLER' | 'BOT' | 'TOOL' | 'SYSTEM'
  text: string
}

export interface Evidence {
  callNumber: number
  excerpt: string
}

export interface PatternCandidate {
  kind: 'pattern'
  suggestedName: string
  description: string
  severity: 'critical' | 'major' | 'minor'
  errorType: string
  stage: string
  detectionMethod: 'keyword' | 'regex' | 'behavioral'
  detectionConfig: Record<string, any>
  callCount: number
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  evidence: Evidence[]
}

export interface TestCaseCandidate {
  kind: 'test_case'
  suggestedScenario: string
  description: string
  callCount: number
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  evidence: Evidence[]
}

export type Candidate = PatternCandidate | TestCaseCandidate;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','so','to','of','in','on','for','with',
  'is','are','was','were','be','been','am','i','you','he','she','it','we','they',
  'me','my','your','this','that','these','those','have','has','had','do','does',
  'did','can','could','will','would','shall','should','may','might','must','not',
  'no','yes','okay','ok','please','thank','thanks','hello','hi','sir','madam',
  'ma','am','from','at','by','as','about','there','here','what','when','where',
  'how','who','which','one','two','all','any','some','just','like','get','got',
  'know','want','need','let','see','tell','say','said','call','number','time'
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

function botTurns(t: TranscriptTurn[]): string[] {
  return t.filter(x => x.speaker === 'BOT').map(x => x.text.trim());
}

function callerText(t: TranscriptTurn[]): string {
  return t.filter(x => x.speaker === 'CALLER').map(x => x.text).join(' ');
}

function truncate(s: string, n = 140): string {
  return s.length > n ? `${s.substring(0, n)}...` : s;
}

// ---------------------------------------------------------------
// Existing coverage — so we never suggest what already exists
// ---------------------------------------------------------------

function existingCoverage(botId: string) {
  const patterns = db
    .prepare('SELECT name, detection_config FROM error_patterns WHERE bot_id = ?')
    .all(botId) as { name: string; detection_config: string }[];

  const coveredChecks = new Set<string>();
  const coveredPhrases = new Set<string>();
  for (const p of patterns) {
    try {
      const cfg = JSON.parse(p.detection_config);
      if (cfg.check) coveredChecks.add(cfg.check);
      for (const list of [cfg.phrases, cfg.forbidden, cfg.required]) {
        if (Array.isArray(list)) list.forEach((x: string) => coveredPhrases.add(x.toLowerCase()));
      }
    } catch {
      // ignore malformed config
    }
  }

  const testCases = db
    .prepare('SELECT spec FROM test_cases WHERE bot_id = ?')
    .all(botId) as { spec: string }[];

  const coveredScenarios = new Set<string>();
  const scenarioKeywords = new Set<string>();
  for (const tc of testCases) {
    try {
      const spec = JSON.parse(tc.spec);
      if (spec.scenario_type) coveredScenarios.add(spec.scenario_type.toLowerCase());
      const blob = `${spec.scenario_type || ''} ${spec.goal || ''} ${spec.persona || ''}`;
      tokens(blob).forEach(w => scenarioKeywords.add(w));
    } catch {
      // ignore malformed spec
    }
  }

  return { coveredChecks, coveredPhrases, coveredScenarios, scenarioKeywords };
}

// ---------------------------------------------------------------
// Pattern candidates
// ---------------------------------------------------------------

/**
 * 1. Bot lines that repeat within a call, across many calls.
 *    Distinct from the existing consecutive-repeat rule: this catches
 *    non-adjacent repeats, which is what a state-machine stall looks like.
 */
function findRepeatedLines(
  calls: { callNumber: number; turns: TranscriptTurn[] }[],
  covered: ReturnType<typeof existingCoverage>
): PatternCandidate[] {
  if (covered.coveredChecks.has('repeat_count')) return [];

  const lineToCalls = new Map<string, Evidence[]>();

  for (const call of calls) {
    const counts = new Map<string, number>();
    for (const turn of botTurns(call.turns)) {
      const key = turn.toLowerCase();
      if (key.length < 25) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const [line, n] of counts) {
      if (n < 2) continue;
      if (!lineToCalls.has(line)) lineToCalls.set(line, []);
      lineToCalls.get(line)!.push({
        callNumber: call.callNumber,
        excerpt: `said ${n}x: "${truncate(line)}"`
      });
    }
  }

  const out: PatternCandidate[] = [];
  for (const [line, evidence] of lineToCalls) {
    if (evidence.length < 3) continue;
    out.push({
      kind: 'pattern',
      suggestedName: 'Non-adjacent line repeat',
      description: `Bot repeats "${truncate(line, 60)}" more than once within the same call, seen across ${evidence.length} calls.`,
      severity: evidence.length >= calls.length * 0.25 ? 'critical' : 'major',
      errorType: 'repetition',
      stage: 'any',
      detectionMethod: 'behavioral',
      detectionConfig: { check: 'repeat_count', threshold: 2, min_length: 25 },
      callCount: evidence.length,
      confidence: evidence.length >= 5 ? 'high' : 'medium',
      rationale: `Appears in ${evidence.length} of ${calls.length} calls. Repeats are non-adjacent, so the existing consecutive-repeat rule does not catch them.`,
      evidence: evidence.slice(0, 5)
    });
  }
  return out;
}

/**
 * 2. Words that appear far more often in failing calls than passing ones.
 *    A crude but real signal: language the bot only uses when things go wrong.
 */
function findDivergentPhrases(
  calls: { callNumber: number; turns: TranscriptTurn[]; failed: boolean }[],
  covered: ReturnType<typeof existingCoverage>
): PatternCandidate[] {
  const failing = calls.filter(c => c.failed);
  const passing = calls.filter(c => !c.failed);
  if (failing.length < 3 || passing.length < 3) return [];

  const countIn = (subset: typeof calls) => {
    const m = new Map<string, number>();
    for (const c of subset) {
      const seen = new Set(tokens(botTurns(c.turns).join(' ')));
      for (const w of seen) m.set(w, (m.get(w) || 0) + 1);
    }
    return m;
  };

  const failCounts = countIn(failing);
  const passCounts = countIn(passing);

  const out: PatternCandidate[] = [];
  for (const [word, fc] of failCounts) {
    if (covered.coveredPhrases.has(word)) continue;
    const failRate = fc / failing.length;
    const passRate = (passCounts.get(word) || 0) / passing.length;
    // Present in most failing calls, rare in passing ones
    if (failRate < 0.6 || passRate > 0.15) continue;

    const evidence: Evidence[] = failing
      .filter(c => botTurns(c.turns).some(t => t.toLowerCase().includes(word)))
      .slice(0, 5)
      .map(c => {
        const line = botTurns(c.turns).find(t => t.toLowerCase().includes(word)) || '';
        return { callNumber: c.callNumber, excerpt: truncate(line) };
      });

    out.push({
      kind: 'pattern',
      suggestedName: `Failure-linked phrase: "${word}"`,
      description: `The bot says "${word}" in ${Math.round(failRate * 100)}% of failing calls but only ${Math.round(passRate * 100)}% of passing ones.`,
      severity: 'minor',
      errorType: 'other',
      stage: 'any',
      detectionMethod: 'keyword',
      detectionConfig: { target: 'bot', mode: 'contains', phrases: [word] },
      callCount: fc,
      confidence: failRate > 0.8 && passRate === 0 ? 'medium' : 'low',
      rationale: `Correlation only, not a cause. Review the excerpts before accepting — "${word}" may simply be vocabulary common to one flow that happens to fail for other reasons.`,
      evidence
    });
  }

  return out.sort((a, b) => b.callCount - a.callCount).slice(0, 5);
}

/**
 * 3. Calls that end on a bot question — the caller never answered, which
 *    usually means an abrupt disconnect or an unhandled dead end.
 */
function findDeadEnds(
  calls: { callNumber: number; turns: TranscriptTurn[] }[]
): PatternCandidate[] {
  const evidence: Evidence[] = [];
  for (const call of calls) {
    const turns = call.turns.filter(t => t.speaker === 'BOT' || t.speaker === 'CALLER');
    const last = turns[turns.length - 1];
    if (!last || last.speaker !== 'BOT') continue;
    if (!last.text.trim().endsWith('?')) continue;
    evidence.push({ callNumber: call.callNumber, excerpt: truncate(last.text) });
  }

  if (evidence.length < 3) return [];

  return [{
    kind: 'pattern',
    suggestedName: 'Call ends on unanswered bot question',
    description: `The final turn is a bot question with no caller reply, in ${evidence.length} calls. Suggests a disconnect or dead end rather than a clean close.`,
    severity: 'major',
    errorType: 'timeout',
    stage: 'closing',
    detectionMethod: 'behavioral',
    detectionConfig: { check: 'ends_on_question' },
    callCount: evidence.length,
    confidence: evidence.length >= 5 ? 'high' : 'medium',
    rationale: `${evidence.length} of ${calls.length} calls. Note: needs an 'ends_on_question' check added to BEHAVIORAL_CHECKS before it will run.`,
    evidence: evidence.slice(0, 5)
  }];
}

// ---------------------------------------------------------------
// Test case candidates
// ---------------------------------------------------------------

/**
 * Groups calls by caller-intent keywords and flags clusters whose vocabulary
 * does not overlap any existing test case scenario. That is a coverage gap —
 * how PEHC-26 through 29 should have been found.
 */
function findScenarioGaps(
  calls: { callNumber: number; turns: TranscriptTurn[]; detectedFlow?: string }[],
  covered: ReturnType<typeof existingCoverage>
): TestCaseCandidate[] {
  const wordToCalls = new Map<string, Evidence[]>();

  for (const call of calls) {
    const text = callerText(call.turns);
    const seen = new Set(tokens(text));
    for (const w of seen) {
      if (covered.scenarioKeywords.has(w)) continue; // already described by a test case
      if (!wordToCalls.has(w)) wordToCalls.set(w, []);
      wordToCalls.get(w)!.push({ callNumber: call.callNumber, excerpt: truncate(text, 120) });
    }
  }

  const out: TestCaseCandidate[] = [];
  for (const [word, evidence] of wordToCalls) {
    if (evidence.length < 3) continue;
    out.push({
      kind: 'test_case',
      suggestedScenario: `caller_mentions_${word}`,
      description: `${evidence.length} callers raise "${word}", which no current test case scenario mentions.`,
      callCount: evidence.length,
      confidence: evidence.length >= 6 ? 'medium' : 'low',
      rationale: `Keyword-clustered, not intent-clustered — read the excerpts and decide whether these calls are really one scenario. Naming and expected behaviour are yours to write.`,
      evidence: evidence.slice(0, 5)
    });
  }

  return out.sort((a, b) => b.callCount - a.callCount).slice(0, 8);
}

// ---------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------

export interface AnalyseInput {
  botId: string
  calls: { callNumber: number; transcriptText: string; failed?: boolean; detectedFlow?: string }[]
}

export function analyseTranscripts(input: AnalyseInput): {
  patternCandidates: PatternCandidate[]
  testCaseCandidates: TestCaseCandidate[]
  callsAnalysed: number
  notes: string[]
} {
  const covered = existingCoverage(input.botId);

  const calls = input.calls.map(c => ({
    callNumber: c.callNumber,
    turns: parseTranscript(c.transcriptText) as TranscriptTurn[],
    failed: !!c.failed,
    detectedFlow: c.detectedFlow
  }));

  const patternCandidates = [
    ...findRepeatedLines(calls, covered),
    ...findDeadEnds(calls),
    ...findDivergentPhrases(calls, covered)
  ];

  const testCaseCandidates = findScenarioGaps(calls, covered);

  const notes: string[] = [
    'These are heuristic suggestions from frequency and divergence analysis, not judgements about bot behaviour.',
    'Nothing is written to the database until you accept it.',
    'Low-confidence items are correlations — read the evidence before accepting.'
  ];

  // ---- LLM SEAM ------------------------------------------------
  // When API access is available, send `calls` plus these candidates to a
  // model and ask it to (a) merge duplicates, (b) write real descriptions,
  // (c) drop spurious correlations, (d) propose scenario names from caller
  // intent rather than keywords. Return the same shapes so the UI is
  // unchanged. Until then the output above is deliberately conservative
  // and every item stays behind human approval.
  // --------------------------------------------------------------

  return {
    patternCandidates,
    testCaseCandidates,
    callsAnalysed: calls.length,
    notes
  };
}
