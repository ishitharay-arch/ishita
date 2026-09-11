const db = require('better-sqlite3')('./data/eval.db');
const bot = db.prepare('SELECT id FROM bots WHERE name = ?').get('Sameeksha');
if (!bot) { console.log('Bot "Sameeksha" not found.'); process.exit(1); }

// ---------------------------------------------------------------
// PART 1 — fix test cases whose phrases can never match
// ---------------------------------------------------------------

const fixes = {
  // Bot actually says "pre-emp-health-check at medibuddy dot in", never "preemphealthcheck".
  // "app" was prohibited but matches inside "appointment"; "Jio" always appears because
  // the bot's own company question lists "Reliance Jio, Reliance Non-Jio".
  'PEHC-16': {
    must_say: ['company hr', 'pre-emp-health-check'],
    must_not_say: ['medibuddy app or portal', 'username and password']
  },
  'PEHC-17': {
    must_say: ['pre-emp-health-check'],
    must_not_say: ['medibuddy app or portal']
  },
  // "transfer" / "agent" are legitimate in Non-Jio calls that escalate.
  'PEHC-14': {
    must_say: ['whatsapp', '24 hours'],
    must_not_say: ['medibuddy app or portal']
  }
};

let fixed = 0;
for (const [id, patch] of Object.entries(fixes)) {
  const row = db.prepare('SELECT spec FROM test_cases WHERE id = ? AND bot_id = ?').get(id, bot.id);
  if (!row) { console.log(`  ${id} not found, skipping`); continue; }
  const spec = JSON.parse(row.spec);
  Object.assign(spec, patch);
  db.prepare('UPDATE test_cases SET spec = ? WHERE id = ? AND bot_id = ?')
    .run(JSON.stringify(spec), id, bot.id);
  fixed++;
}
console.log(`Fixed ${fixed} test cases`);

// ---------------------------------------------------------------
// PART 2 — add test cases for scenarios that had no coverage
// ---------------------------------------------------------------

const newCases = [
  {
    id: 'PEHC-26',
    scenario_type: 'out_of_scope_ivr_redirect',
    priority: 'P0',
    description: 'Caller asks about something outside PEHC. Bot must redirect to the IVR menu, not raise a ticket or transfer.',
    must_say: ['ivr menu'],
    must_not_say: ['support ticket has been raised', 'transfer your call'],
    expected_tools: [],
    expect_terminal_state: true
  },
  {
    id: 'PEHC-27',
    scenario_type: 'number_capture_failure',
    priority: 'P1',
    description: 'Bot never successfully captured the mobile number and looped on re-asking. Should reach a booking lookup.',
    must_say: [],
    must_not_say: [],
    expected_tools: [],
    expect_terminal_state: false
  },
  {
    id: 'PEHC-28',
    scenario_type: 'transfer_request_only',
    priority: 'P1',
    description: 'Caller only wants a live agent. Bot should attempt transfer without looping indefinitely.',
    must_say: [],
    must_not_say: [],
    expected_tools: [],
    expect_terminal_state: true
  },
  {
    id: 'PEHC-29',
    scenario_type: 'no_progress',
    priority: 'P2',
    description: 'Call ended before any meaningful flow started (dead air, audio issues, caller hung up).',
    must_say: [],
    must_not_say: [],
    expected_tools: [],
    expect_terminal_state: false
  }
];

const insert = db.prepare(`
  INSERT OR IGNORE INTO test_cases (id, bot_id, spec, approved_by, approved_at)
  VALUES (?, ?, ?, 'manual', datetime('now'))
`);

let added = 0;
for (const tc of newCases) {
  const res = insert.run(tc.id, bot.id, JSON.stringify(tc));
  if (res.changes) added++;
}
console.log(`Added ${added} new test cases`);

console.log('Total for Sameeksha:',
  db.prepare('SELECT COUNT(*) c FROM test_cases WHERE bot_id = ?').get(bot.id).c
);
