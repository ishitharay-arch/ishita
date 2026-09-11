// Writes Claude's own grading verdicts for the 30 real Sameeksha calls in
// pehc30.pdf into the platform — no ANTHROPIC_API_KEY, no billed API call.
//
// This is the pattern for LLM-assisted grading without a key: Claude (the
// agent) reads the bot's live prompt, its test cases, and each transcript
// directly, forms a verdict the same way a human QC reviewer would, and
// writes it back through the existing /api/llm-verdict endpoint — designed
// for exactly this ("stores Claude's grading verdict"). /api/llm-context
// is what supplies the bot's prompt/test cases/error patterns for this.
//
// Each transcript is also run through /api/auto-grade first, purely to link
// the LLM verdict to the same run_id/result_id as the deterministic grade —
// this is "LLM-based grading in addition to the rule-based grading", not a
// replacement for it.
//
// VERDICTS below is Claude's actual per-call assessment from reading all 30
// transcripts (see the chat write-up this script accompanies). To repeat
// this for another bot or another batch: fetch that bot's context via
// GET /api/llm-context?botId=..., have Claude read it plus the transcripts,
// and fill in a VERDICTS map the same shape as this one.
//
//   node scripts/claude-grade-pehc30.js

const fs = require('fs');
const pdfParse = require('pdf-parse');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BOT_ID = 'sameeksha';

// Keyed by call index (1-30, matching pehc30.pdf's own numbering).
const VERDICTS = {
  1:  { verdict: 'pass',    confidence: 0.85, failures: [], summary: "Clean IVR redirect for an out-of-scope booking request.", remarks: "One truncated bot line ('BOT: I') — looks like a technical/ASR glitch, not a content violation.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 5 } },
  2:  { verdict: 'fail',    confidence: 0.95, failures: ["13-minute transfer loop never resolved the caller's Jalgaon slot query", "'Sorry, I didn't catch that — are you still there?' repeated 10+ times", "Call ends in a hard failure message ('network issue, please call back') with the original question unanswered"], summary: "Severe, unresolved transfer loop — the worst outcome type in this sample.", scores: { no_self_narration: 5, escalation_persistence: 1, empathy_tone: 2, clean_resolution: 1 } },
  3:  { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Clean reschedule redirect to IVR.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 5, clean_resolution: 5 } },
  4:  { verdict: 'pass',    confidence: 0.75, failures: [], summary: "Correct HR redirect after brief confusion on the company name.", remarks: "The deterministic grader flagged this call against PEHC-16's exact scripted wording — expected, since this is a real call and won't match a synthetic script verbatim.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 4, clean_resolution: 5 } },
  5:  { verdict: 'fail',    confidence: 0.95, failures: ["15-minute unresolved transfer loop for a Jalgaon slot/hospital query — the longest call in the sample", "'are you still there?' repeated many times", "Transcript appears to drop mid-loop without any resolution or failure message"], summary: "Severe unresolved transfer loop.", scores: { no_self_narration: 5, escalation_persistence: 1, empathy_tone: 2, clean_resolution: 1 } },
  6:  { verdict: 'partial', confidence: 0.7,  failures: ["Call ends on the bot's closing question with no reply, right after the caller said 'Bye'"], summary: "Likely just a normal hangup after the caller said bye — flagged defensively, not a clear bug.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 4, clean_resolution: 4 } },
  7:  { verdict: 'partial', confidence: 0.75, failures: ["Call abandoned mid-flow; the bot's clarifying question about the caller's company was never answered, so the HR redirect was never actually delivered"], summary: "Incomplete resolution — caller dropped before the flow could complete.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 4, clean_resolution: 2 } },
  8:  { verdict: 'pass',    confidence: 0.8,  failures: [], summary: "Successful HR redirect; call ended naturally after resolution.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 4 } },
  9:  { verdict: 'partial', confidence: 0.8,  failures: ["The same ticket confirmation (identical reference number) is read out twice after the caller re-asked to raise a ticket — suggests the bot may not track that a ticket was already raised in-call"], summary: "Ticket raised and the 24-hour window correctly stated, but the flow suggests a possible duplicate-ticket risk.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 4, clean_resolution: 4 } },
  10: { verdict: 'pass',    confidence: 0.75, failures: [], summary: "Resolved after a clunky multi-attempt number/order-ID confirmation; HR redirect given correctly in the end.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 3, clean_resolution: 4 } },
  11: { verdict: 'fail',    confidence: 0.9,  failures: ["Transfer loop timeout — caller is never connected to a support agent for a slot-availability issue", "'are you still there?' repeated 3+ times", "Ends in a hard failure message"], summary: "Unresolved transfer loop.", scores: { no_self_narration: 5, escalation_persistence: 2, empathy_tone: 3, clean_resolution: 1 } },
  12: { verdict: 'partial', confidence: 0.9,  failures: ["Bot says \"I'll continue in English\" — explicit self-narration the live prompt's OUTPUT RULES explicitly forbid, word for word"], summary: "Correct Hindi language handling and appointment lookup, but violates the prompt's own explicit ban on narrating language switches.", scores: { no_self_narration: 1, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 4 } },
  13: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Correctly redirected an off-topic billing/claims question.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 5 } },
  14: { verdict: 'fail',    confidence: 0.95, failures: ["Identical clarifying question ('Could you tell me a bit about what you need help with?') repeated ~6 times despite the caller clearly asking for customer support every time", "Caller expresses explicit frustration (\"You are the only problem\")", "Ends in a failed transfer with no resolution"], summary: "The worst intent-recognition failure in the sample — the bot never escalates despite repeated, clear, identical requests from the caller.", scores: { no_self_narration: 5, escalation_persistence: 1, empathy_tone: 2, clean_resolution: 1 } },
  15: { verdict: 'fail',    confidence: 0.9,  failures: ["Transfer loop timeout — never connects to an agent", "'are you still there?' repeated 3+ times"], summary: "Unresolved transfer loop; the call appears to just stop.", scores: { no_self_narration: 5, escalation_persistence: 2, empathy_tone: 3, clean_resolution: 1 } },
  16: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Correct off-topic redirect for a lab-test query.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 5 } },
  17: { verdict: 'partial', confidence: 0.8,  failures: ["Call ends mid digit-collection loop after repeated ASR failures on the phone number; never reaches resolution"], summary: "Frustrating repeated-digit-confirmation loop; the call is abandoned before resolution.", scores: { no_self_narration: 5, escalation_persistence: 3, empathy_tone: 3, clean_resolution: 2 } },
  18: { verdict: 'partial', confidence: 0.75, failures: ["'are you still there?' repeated twice", "Call ends on an unanswered clarifying question about the caller's company"], summary: "Incomplete resolution after a rocky start (the bot didn't understand 'connect with executive' initially).", scores: { no_self_narration: 5, escalation_persistence: 3, empathy_tone: 3, clean_resolution: 3 } },
  19: { verdict: 'partial', confidence: 0.5,  failures: ["Transcript is very short and the caller's speech is largely unintelligible (likely an ASR/audio-quality issue)"], summary: "Too little signal to fully assess the bot's behavior; appears to be a very short, low-quality call.", remarks: "No flow rule matched this call in auto-grade — recommend reviewing audio quality rather than bot behavior here.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 3, clean_resolution: 2 } },
  20: { verdict: 'fail',    confidence: 0.85, failures: ["Three consecutive, identical 'Sorry, I could not capture that clearly' bot turns with no caller speech between them — looks like a bot-side glitch re-prompting itself, not a genuine ASR failure", "A support ticket is offered but the flow never completes; unclear whether a ticket was actually raised", "Call ends on the same unanswered clarifying question"], summary: "Likely a technical malfunction (repeated self-triggered re-prompt) compounding an already difficult call.", scores: { no_self_narration: 5, escalation_persistence: 2, empathy_tone: 2, clean_resolution: 1 } },
  21: { verdict: 'partial', confidence: 0.8,  failures: ["The exact same redirect line is given verbatim to 3 different off-topic questions in a row — technically compliant but robotic and unhelpful"], summary: "Compliant but low-quality — no attempt to vary the response or acknowledge the different questions asked.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 2, clean_resolution: 4 } },
  22: { verdict: 'pass',    confidence: 0.85, failures: [], summary: "Correct redirect after some back-and-forth clearing up an ASR 'Hello' loop.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 4, clean_resolution: 4 } },
  23: { verdict: 'partial', confidence: 0.6,  failures: ["Bot repeats its exact opening question after the caller says 'Hello' again — no progress made before the transcript ends"], summary: "Short, likely-dropped call stuck in an opening-question loop.", remarks: "No flow rule matched this call in auto-grade.", scores: { no_self_narration: 5, escalation_persistence: 3, empathy_tone: 3, clean_resolution: 2 } },
  24: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Clean off-topic redirect.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 5 } },
  25: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Clean off-topic redirect (reimbursement/wallet query).", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 5 } },
  26: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Clean off-topic redirect (family lab test / wallet query).", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 4, clean_resolution: 5 } },
  27: { verdict: 'pass',    confidence: 0.85, failures: [], summary: "Successful HR redirect plus a second off-topic redirect, both handled correctly.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 5, clean_resolution: 5 } },
  28: { verdict: 'partial', confidence: 0.8,  failures: ["Exact opening question repeated 3 times while the caller just says 'Hello' each time before giving real input — same 'stuck loop' pattern seen in calls 21/23"], summary: "Eventually resolves well (WhatsApp document sent, clean close) but wastes several turns stuck on the opening prompt.", scores: { no_self_narration: 5, escalation_persistence: 4, empathy_tone: 4, clean_resolution: 5 } },
  29: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Good example call — messy digit confirmation handled patiently, resolved with a clean, warm close.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 5, clean_resolution: 5 } },
  30: { verdict: 'pass',    confidence: 0.9,  failures: [], summary: "Good example call — similar to #29, resolved cleanly with a warm close.", scores: { no_self_narration: 5, escalation_persistence: 5, empathy_tone: 5, clean_resolution: 5 } },
};

async function extractCalls() {
  const buf = fs.readFileSync('pehc30.pdf');
  const { text } = await pdfParse(buf);
  const callHeaderRe = /\n\s*(\d+)\.\s+([0-9a-f-]{36})\s*\n/gi;
  const matches = [...text.matchAll(callHeaderRe)];
  const calls = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    calls.push({
      index: Number(matches[i][1]),
      id: matches[i][2],
      transcriptText: cleanTranscriptBlock(text.slice(start, end)),
    });
  }
  return calls;
}

function cleanTranscriptBlock(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const turnStart = /^(BOT|USER)\s*[:\]]/i;
  const metadataLine = /^-\s*(Start|Duration|Customer|Intent|Outcome):/i;
  const headerLine = /^\d+\.\s+[0-9a-f-]{36}$/i;
  const out = [];
  for (const line of lines) {
    if (headerLine.test(line) || metadataLine.test(line)) continue;
    if (turnStart.test(line)) out.push(line);
    else if (out.length > 0) out[out.length - 1] += ' ' + line;
  }
  return out.join('\n');
}

async function postJson(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const calls = await extractCalls();
  console.log(`Extracted ${calls.length} calls. Writing Claude's verdicts...\n`);

  let written = 0;
  for (const call of calls) {
    const v = VERDICTS[call.index];
    if (!v) { console.log(`Call ${call.index}: no verdict authored, skipping`); continue; }

    const auto = await postJson('/api/auto-grade', {
      botId: BOT_ID,
      transcriptText: call.transcriptText,
    });
    const resultId = auto.ok ? auto.data.result?.resultId : null;
    const runId = auto.ok ? auto.data.result?.runId : null;
    const detectedFlow = auto.ok ? auto.data.result?.detectedFlow : null;

    const softScores = Object.entries(v.scores).map(([ruleName, score]) => ({
      ruleName, score, reason: `Claude's read of the transcript for "${ruleName.replace(/_/g, ' ')}".`,
    }));

    const saved = await postJson('/api/llm-verdict', {
      botId: BOT_ID,
      resultId,
      runId,
      interactionId: call.id,
      transcript: call.transcriptText,
      claudeVerdict: {
        verdict: v.verdict,
        detected_flow: detectedFlow,
        confidence: v.confidence,
        failures: v.failures,
        summary: v.summary,
        remarks: v.remarks || null,
      },
      softScores,
    });

    if (saved.ok) {
      written++;
      console.log(`Call ${call.index} (${call.id.slice(0, 8)}): ${v.verdict.toUpperCase()} — saved as llm_verdicts/${saved.data.id}`);
    } else {
      console.log(`Call ${call.index}: FAILED to save — ${JSON.stringify(saved.data)}`);
    }
  }

  console.log(`\nWrote ${written} of ${calls.length} LLM verdicts to the platform.`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
