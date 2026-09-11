// Which test case does this transcript belong to?
//
// Rules live in the flow_rules table, keyed by bot_id, so adding or tuning a
// flow is a row change rather than a code edit — and one bot's phrases can
// never match another bot's call.
//
// Two deliberate changes from the previous hardcoded version:
//
// 1. No default. If nothing matches, this returns null and the caller must
//    say so. The old fallback assigned an unmatched call to PEHC-29, which
//    meant a detection failure looked like a graded result — and if that
//    test case has no rules, it looked like a pass.
//
// 2. Detection is still on the bot's own scripted lines by default, because
//    caller speech is raw ASR. A rule can opt into caller speech with
//    side: 'caller' where the bot's own output does not distinguish flows.
//
// Not every bot can be auto-detected. A router bot says nearly the same thing
// in every scenario, so its output cannot identify which scenario ran; grade
// those with the test case selected by hand.

import db from '@/lib/db';

export type MatchConfig = {
  side?: 'bot' | 'caller';
  all?: string[];
  any?: string[];
  any2?: string[];
  none?: string[];
  counts?: { phrase: string; min: number }[];
};

export type FlowMatch = {
  testCaseId: string;
  ruleId: string;
  label: string | null;
  priority: number;
};

type Row = {
  id: string;
  test_case_id: string;
  label: string | null;
  priority: number;
  match_config: string;
};

function norm(s: string): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ');
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

export function matches(cfg: MatchConfig, bot: string, caller: string): boolean {
  const hay = cfg.side === 'caller' ? caller : bot;

  if (cfg.all?.length && !cfg.all.every(p => hay.includes(norm(p)))) return false;
  if (cfg.any?.length && !cfg.any.some(p => hay.includes(norm(p)))) return false;
  if (cfg.any2?.length && !cfg.any2.some(p => hay.includes(norm(p)))) return false;
  if (cfg.none?.length && cfg.none.some(p => hay.includes(norm(p)))) return false;
  if (cfg.counts?.length &&
      !cfg.counts.every(c => occurrences(hay, norm(c.phrase)) >= c.min)) return false;

  // An empty config would match everything. Treat it as no rule at all.
  const hasClause = !!(cfg.all?.length || cfg.any?.length || cfg.any2?.length ||
                       cfg.none?.length || cfg.counts?.length);
  return hasClause;
}

/**
 * Returns the highest-priority matching rule, or null when nothing matches.
 * Never guesses.
 */
export function detectFlow(
  botSpeech: string,
  callerSpeech: string,
  botId: string
): FlowMatch | null {
  if (!botId) throw new Error('detectFlow requires a botId');

  const bot = norm(botSpeech);
  const caller = norm(callerSpeech);

  const rows = db.prepare(`
    SELECT id, test_case_id, label, priority, match_config
    FROM flow_rules
    WHERE bot_id = ? AND active = 1
    ORDER BY priority ASC, id ASC
  `).all(botId) as Row[];

  for (const row of rows) {
    let cfg: MatchConfig;
    try {
      cfg = JSON.parse(row.match_config);
    } catch {
      continue; // a malformed rule is skipped, never treated as a match
    }
    if (matches(cfg, bot, caller)) {
      return {
        testCaseId: row.test_case_id,
        ruleId: row.id,
        label: row.label,
        priority: row.priority
      };
    }
  }

  return null;
}

/**
 * Every rule that matched, not just the winner. Use this on the Transcripts
 * page to show why a call was classified the way it was, and to spot flows
 * that overlap and should be tightened.
 */
export function detectFlowAll(
  botSpeech: string,
  callerSpeech: string,
  botId: string
): FlowMatch[] {
  const bot = norm(botSpeech);
  const caller = norm(callerSpeech);

  const rows = db.prepare(`
    SELECT id, test_case_id, label, priority, match_config
    FROM flow_rules
    WHERE bot_id = ? AND active = 1
    ORDER BY priority ASC, id ASC
  `).all(botId) as Row[];

  const hits: FlowMatch[] = [];
  for (const row of rows) {
    try {
      if (matches(JSON.parse(row.match_config), bot, caller)) {
        hits.push({
          testCaseId: row.test_case_id,
          ruleId: row.id,
          label: row.label,
          priority: row.priority
        });
      }
    } catch { /* skip malformed */ }
  }
  return hits;
}
