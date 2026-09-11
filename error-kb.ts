import db from '@/lib/db';

export interface TranscriptTurn {
  speaker: 'CALLER' | 'BOT' | 'TOOL' | 'SYSTEM'
  text: string
}

export interface PatternRow {
  id: string
  bot_id: string
  name: string
  description: string
  severity: 'critical' | 'major' | 'minor'
  error_type: string
  stage: string
  detection_method: 'keyword' | 'regex' | 'behavioral'
  detection_config: string
  source: 'manual' | 'auto_detected'
  active: number
  times_triggered: number
}

export interface PatternFailure {
  patternId: string
  name: string
  severity: 'critical' | 'major' | 'minor'
  errorType: string
  stage: string
  message: string
}

// Same shape the rest of the grader uses: `{name}: {error_type}: {detail}`
function formatMessage(p: PatternRow, detail: string): string {
  return `${p.name}: ${p.error_type}: ${detail.replace(/:/g, ' -')}`;
}

function speechFor(transcript: TranscriptTurn[], target: string): string {
  const speaker = target === 'caller' ? 'CALLER' : 'BOT';
  if (target === 'both') {
    return transcript.map(t => t.text).join(' ').toLowerCase();
  }
  return transcript
    .filter(t => t.speaker === speaker)
    .map(t => t.text)
    .join(' ')
    .toLowerCase();
}

/**
 * keyword config:
 *   { target?: 'bot'|'caller'|'both',
 *     forbidden?: string[],          // any present -> failure
 *     required?: string[],           // none present -> failure
 *     if_present?: string[],         // gate: only check `required` when one of these appears
 *     detail?: string }
 */
function runKeyword(p: PatternRow, cfg: any, transcript: TranscriptTurn[]): string | null {
  const speech = speechFor(transcript, cfg.target || 'bot');

  if (Array.isArray(cfg.forbidden)) {
    const hit = cfg.forbidden.find((k: string) => speech.includes(k.toLowerCase()));
    if (hit) return formatMessage(p, cfg.detail || `found "${hit}"`);
  }

  if (Array.isArray(cfg.required)) {
    const gated = Array.isArray(cfg.if_present)
      ? cfg.if_present.some((k: string) => speech.includes(k.toLowerCase()))
      : true;
    if (gated) {
      const found = cfg.required.some((k: string) => speech.includes(k.toLowerCase()));
      if (!found) return formatMessage(p, cfg.detail || `missing "${cfg.required[0]}"`);
    }
  }

  return null;
}

/**
 * regex config: { pattern: string, flags?: string, target?: string, expect?: 'absent'|'present', detail?: string }
 */
function runRegex(p: PatternRow, cfg: any, transcript: TranscriptTurn[]): string | null {
  const speech = speechFor(transcript, cfg.target || 'bot');
  let re: RegExp;
  try {
    re = new RegExp(cfg.pattern, cfg.flags || 'i');
  } catch {
    console.error(`Error KB: pattern ${p.name} has invalid regex, skipping`);
    return null;
  }
  const matched = re.test(speech);
  const expectPresent = cfg.expect === 'present';
  if (matched && !expectPresent) {
    return formatMessage(p, cfg.detail || `matched /${cfg.pattern}/`);
  }
  if (!matched && expectPresent) {
    return formatMessage(p, cfg.detail || `expected /${cfg.pattern}/, not found`);
  }
  return null;
}

/**
 * behavioral config: { check: string, ...checkSpecificOptions }
 * Named checks are implemented in code; the KB row picks which one and tunes it.
 */
const BEHAVIORAL_CHECKS: Record<
  string,
  (p: PatternRow, cfg: any, transcript: TranscriptTurn[]) => string | null
> = {
  // Bot says the same thing twice in a row.
  consecutive_repeat: (p, cfg, transcript) => {
    const minLength = cfg.min_length ?? 20;
    const exclude: string[] = cfg.exclude_phrases || [];
    const turns = transcript
      .filter(t => t.speaker === 'BOT')
      .map(t => t.text.trim().toLowerCase());

    for (let i = 1; i < turns.length; i++) {
      if (turns[i].length > minLength && turns[i] === turns[i - 1]) {
        if (exclude.some(x => turns[i].includes(x.toLowerCase()))) continue;
        const snippet = turns[i].substring(0, cfg.snippet_length ?? 120);
        return formatMessage(p, `Bot repeated itself - "${snippet}..."`);
      }
    }
    return null;
  },

  // Bot re-issues an opening line after the conversation has moved on.
  opener_reissued: (p, cfg, transcript) => {
    const turns = transcript
      .filter(t => t.speaker === 'BOT')
      .map(t => t.text.trim().toLowerCase());
    if (turns.length < 3) return null;
    const opener = turns[0];
    if (opener.length < (cfg.min_length ?? 20)) return null;
    for (let i = 2; i < turns.length; i++) {
      if (turns[i] === opener) {
        return formatMessage(p, `Bot returned to its opening line at turn ${i + 1}`);
      }
    }
    return null;
  },

  // Bot asks the same question more than N times across the call.
  question_repeated: (p, cfg, transcript) => {
    const threshold = cfg.threshold ?? 3;
    const counts: Record<string, number> = {};
    transcript
      .filter(t => t.speaker === 'BOT')
      .forEach(t => {
        const text = t.text.trim().toLowerCase();
        if (!text.endsWith('?')) return;
        counts[text] = (counts[text] || 0) + 1;
      });
    const offender = Object.entries(counts).find(([, n]) => n >= threshold);
    if (offender) {
      return formatMessage(
        p,
        `Bot asked the same question ${offender[1]} times - "${offender[0].substring(0, 80)}..."`
      );
    }
    return null;
  }
};

function runBehavioral(p: PatternRow, cfg: any, transcript: TranscriptTurn[]): string | null {
  const check = BEHAVIORAL_CHECKS[cfg.check];
  if (!check) {
    console.error(`Error KB: pattern ${p.name} references unknown check "${cfg.check}", skipping`);
    return null;
  }
  return check(p, cfg, transcript);
}

/**
 * Runs every active error pattern for a bot against one transcript.
 * Replaces the hardcoded regression checks.
 */
export function runErrorPatterns(
  transcript: TranscriptTurn[],
  botId: string
): { failures: PatternFailure[]; patternsEvaluated: number } {
  const patterns = db
    .prepare('SELECT * FROM error_patterns WHERE bot_id = ? AND active = 1')
    .all(botId) as PatternRow[];

  const failures: PatternFailure[] = [];

  for (const p of patterns) {
    let cfg: any;
    try {
      cfg = JSON.parse(p.detection_config);
    } catch {
      console.error(`Error KB: pattern ${p.name} has invalid detection_config JSON, skipping`);
      continue;
    }

    let message: string | null = null;
    if (p.detection_method === 'keyword') message = runKeyword(p, cfg, transcript);
    else if (p.detection_method === 'regex') message = runRegex(p, cfg, transcript);
    else if (p.detection_method === 'behavioral') message = runBehavioral(p, cfg, transcript);

    if (message) {
      failures.push({
        patternId: p.id,
        name: p.name,
        severity: p.severity,
        errorType: p.error_type,
        stage: p.stage,
        message
      });
    }
  }

  // Bump usage counters so the KB shows which patterns actually earn their place.
  if (failures.length > 0) {
    const bump = db.prepare(
      'UPDATE error_patterns SET times_triggered = times_triggered + 1, updated_at = datetime(\'now\') WHERE id = ?'
    );
    for (const f of failures) bump.run(f.patternId);
  }

  return { failures, patternsEvaluated: patterns.length };
}

/** critical -> fail, anything else -> partial, nothing -> pass */
export function statusFor(
  severities: Array<'critical' | 'major' | 'minor'>
): 'pass' | 'partial' | 'fail' {
  if (severities.length === 0) return 'pass';
  return severities.includes('critical') ? 'fail' : 'partial';
}
