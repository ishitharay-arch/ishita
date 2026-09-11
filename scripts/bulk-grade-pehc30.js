// Bulk-runs LLM-assisted grading on the 30 real Sameeksha call transcripts in
// pehc30.pdf, against the running dev server.
//
// For each call:
//   1. POST /api/auto-grade  — deterministic hard-rule + error-pattern check,
//      auto-detects which test case (flow) the real call matches.
//   2. POST /api/grade       — re-grades against the detected (or a generic
//      fallback) test case, this time including Claude's soft-rule scores
//      (empathy, self-narration, escalation persistence, resolution).
//
// Requires: `npm run dev` already running on localhost:3000, and a real
// ANTHROPIC_API_KEY in .env.local for step 2's scores to be real — without
// one, gradeSoftRules() fails closed and softScores comes back empty, so
// this script still runs end-to-end and shows you exactly that.
//
//   node scripts/bulk-grade-pehc30.js

const fs = require('fs');
const pdfParse = require('pdf-parse');
const Database = require('better-sqlite3');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const BOT_ID = 'sameeksha';
const BOT_NAME = 'Sameeksha';
const GENERIC_TEST_CASE_ID = 'REAL-CALL-GENERIC';

function ensureGenericTestCase() {
  const db = new Database('data/eval.db');
  db.prepare(`
    INSERT OR IGNORE INTO test_cases (id, bot_id, spec, approved_by, approved_at)
    VALUES (?, ?, ?, 'bulk-grade-script', datetime('now'))
  `).run(GENERIC_TEST_CASE_ID, BOT_ID, JSON.stringify({
    id: GENERIC_TEST_CASE_ID,
    scenario_type: 'real_call_generic',
    priority: 'P2',
    description: 'Fallback bucket for real production calls that auto-detect could not map to a specific synthetic flow. No hard must_say/must_not_say checks — used to still get an LLM soft-rule read on the call.',
    must_say: [],
    must_not_say: [],
    expected_tools: [],
    expect_terminal_state: false,
  }));
  db.close();
}

async function extractCalls() {
  const buf = fs.readFileSync('pehc30.pdf');
  const { text } = await pdfParse(buf);

  // Each call starts with a line like "12. ff2daad4-32bb-4d96-b4af-feee5b8e1df7"
  const callHeaderRe = /\n\s*(\d+)\.\s+([0-9a-f-]{36})\s*\n/gi;
  const matches = [...text.matchAll(callHeaderRe)];

  const calls = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(start, end);
    calls.push({
      index: Number(matches[i][1]),
      id: matches[i][2],
      transcriptText: cleanTranscriptBlock(block),
    });
  }
  return calls;
}

// Strips call metadata (Start/Duration/Customer/Intent/Outcome, the header
// line itself) and rejoins PDF-wrapped continuation lines onto the BOT/USER
// turn they belong to, leaving plain "BOT : ..." / "USER: ..." lines.
function cleanTranscriptBlock(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  const turnStart = /^(BOT|USER)\s*[:\]]/i;
  const metadataLine = /^-\s*(Start|Duration|Customer|Intent|Outcome):/i;
  const headerLine = /^\d+\.\s+[0-9a-f-]{36}$/i;

  const out = [];
  for (const line of lines) {
    if (headerLine.test(line) || metadataLine.test(line)) continue;
    if (turnStart.test(line)) {
      out.push(line);
    } else if (out.length > 0) {
      out[out.length - 1] += ' ' + line;
    }
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
  ensureGenericTestCase();
  const calls = await extractCalls();
  console.log(`Extracted ${calls.length} calls from pehc30.pdf\n`);

  const softRuleTotals = {}; // ruleName -> {sum, n}
  const rows = [];

  for (const call of calls) {
    const auto = await postJson('/api/auto-grade', {
      botId: BOT_ID,
      transcriptText: call.transcriptText,
    });

    const detectedTestCaseId = auto.ok
      ? auto.data.result?.detectedFlow
      : null;
    const testCaseId = detectedTestCaseId || GENERIC_TEST_CASE_ID;

    const graded = await postJson('/api/grade', {
      botId: BOT_ID,
      botName: BOT_NAME,
      testCaseId,
      transcriptText: call.transcriptText,
    });

    const softScores = graded.ok ? (graded.data.result?.softScores || []) : [];
    for (const s of softScores) {
      if (!softRuleTotals[s.ruleName]) softRuleTotals[s.ruleName] = { sum: 0, n: 0 };
      softRuleTotals[s.ruleName].sum += s.score;
      softRuleTotals[s.ruleName].n += 1;
    }

    rows.push({
      call: call.index,
      id: call.id.slice(0, 8),
      flow: detectedTestCaseId || '(no flow detected)',
      hardPassed: auto.ok ? auto.data.result?.passed : 'auto-grade error',
      softScores: softScores.map(s => `${s.ruleName}=${s.score}`).join(', ') || '(no soft scores)',
    });

    process.stdout.write(`Call ${call.index}: ${detectedTestCaseId || 'no-flow'} | hard=${auto.ok ? (auto.data.result?.passed ? 'PASS' : 'FAIL') : 'ERR'} | soft=[${softScores.map(s => s.score).join(',')}]\n`);
  }

  console.log('\n=== Per-call results ===');
  console.table(rows);

  console.log('\n=== Average soft-rule scores across all calls (1-5) ===');
  for (const [name, { sum, n }] of Object.entries(softRuleTotals)) {
    console.log(`${name}: ${(sum / n).toFixed(2)} (n=${n})`);
  }
  if (Object.keys(softRuleTotals).length === 0) {
    console.log('No soft scores were returned at all — check ANTHROPIC_API_KEY / USE_MOCK_MODE in .env.local and that `npm run dev` is running.');
  }
}

main().catch(err => {
  console.error('Bulk grading failed:', err);
  process.exit(1);
});
