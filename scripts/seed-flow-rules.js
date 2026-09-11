// Creates flow_rules and ports the hardcoded Sameeksha logic from
// lib/auto-detect.ts into rows. Run once. Safe to re-run: it clears and
// reseeds only the rows for the bots named below.
//
//   node scripts/seed-flow-rules.js
//
// match_config JSON shape:
//   { side: 'bot' | 'caller',        // which speech to search (default bot)
//     all:  ['a','b'],               // every phrase must appear
//     any:  ['x','y'],               // at least one must appear
//     none: ['z'],                   // none may appear
//     counts: [{ phrase: 'p', min: 2 }] }
// A rule matches when every clause present is satisfied.
// Lower `priority` is evaluated first. First match wins.

const d = require('better-sqlite3')('data/eval.db');
d.pragma('foreign_keys = ON');

d.exec(`
CREATE TABLE IF NOT EXISTS flow_rules (
  id           TEXT PRIMARY KEY,
  bot_id       TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL,
  label        TEXT,
  priority     INTEGER NOT NULL DEFAULT 100,
  match_config TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_flow_rules_bot ON flow_rules(bot_id, priority);
`);

// Ported in the same order the if-chain evaluated. Priority numbers are
// spaced by 10 so rules can be inserted between them later without a reshuffle.
const sameeksha = [
  [10, 'PEHC-07', 'Jio — book via app/portal',
    { any: ['medibuddy app or portal'] }],
  [11, 'PEHC-07', 'Jio — HR credentials',
    { all: ['username and password', 'confirmation email'] }],

  [20, 'PEHC-14', 'Non-Jio — email not yet sent',
    { any: ["haven't yet sent an email"] }],
  [21, 'PEHC-13', 'Non-Jio — email sent, escalated',
    { any: ['have you already sent an email to medibuddy', 'same format mentioned in the document'],
      any2: ['escalate', 'live agent'] }],
  [22, 'PEHC-12', 'Non-Jio — email sent, within 24h',
    { any: ['have you already sent an email to medibuddy', 'same format mentioned in the document'] }],

  [30, 'PEHC-16', 'Other corporate — HR must email',
    { any: ['contact your company hr', 'hr team needs to share'] }],

  [40, 'PEHC-01', 'Appointment already scheduled',
    { all: ['appointment'], any: ['is scheduled at'] }],
  [41, 'PEHC-01', 'Appointment details found',
    { all: ['appointment', 'appointment details', 'scheduled'] }],
  [42, 'PEHC-01', 'Appointment scheduled (Hindi)',
    { any: ['scheduled है', 'details मिल गई'] }],

  [50, 'PEHC-20', 'Slot problem escalated to ticket',
    { any: ['support ticket has been raised', 'would you like me to raise a ticket'],
      all: ['slot'] }],
  [51, 'PEHC-19', 'Booking problem escalated to ticket',
    { any: ['support ticket has been raised', 'would you like me to raise a ticket'] }],

  [60, 'PEHC-26', 'Out of scope — IVR redirect',
    { all: ['help only with pre-employment health check', 'ivr menu'] }],

  [70, 'PEHC-05', 'Company asked / no booking found',
    { any: ['which company you are joining', "couldn't find any booking"] }],

  [80, 'PEHC-28', 'Transfer request only',
    { all: ['speak with our support team'], none: ["couldn't find any booking"] }],

  [90, 'PEHC-27', 'Stuck on number capture',
    { counts: [{ phrase: 'full ten-digit number', min: 2 }] }],
  [91, 'PEHC-27', 'Stuck on registration re-asks',
    { counts: [{ phrase: 'registered', min: 2 }] }],
];

const bots = d.prepare('SELECT id FROM bots').all().map(b => b.id);
const ins = d.prepare(`INSERT INTO flow_rules (id, bot_id, test_case_id, label, priority, match_config)
                       VALUES (?,?,?,?,?,?)`);

function seed(botId, rules) {
  if (!bots.includes(botId)) {
    console.log(`skipped ${botId} — no such bot`);
    return;
  }
  d.prepare('DELETE FROM flow_rules WHERE bot_id = ?').run(botId);
  d.transaction(() => {
    rules.forEach(([priority, tc, label, cfg], i) => {
      ins.run(`${botId}-fr-${String(i).padStart(3, '0')}`, botId, tc, label, priority, JSON.stringify(cfg));
    });
  })();
  console.log(`${botId}: ${rules.length} rules`);
}

seed('sameeksha', sameeksha);

// Rules that point at a test case the bot does not have would never fire
// usefully — surface them now rather than at grading time.
console.log('rules pointing at a missing test case:', d.prepare(`
  SELECT fr.bot_id, fr.test_case_id, fr.label
  FROM flow_rules fr
  LEFT JOIN test_cases tc ON tc.id = fr.test_case_id AND tc.bot_id = fr.bot_id
  WHERE tc.id IS NULL
`).all());

console.log('rules per bot:', d.prepare(
  'SELECT bot_id, COUNT(*) n FROM flow_rules GROUP BY 1').all());