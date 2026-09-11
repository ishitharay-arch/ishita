// Audit feedback: what a human auditor said about a call, joined to what the
// grader said about the same call via interaction_id.
//
//   node scripts/add-audit-feedback.js
//
// The point of this table is not to train anything. It is ground truth. It
// lets you measure how often the grader agrees with your audit team, and the
// disagreements are the work queue: a call your auditor failed that the
// grader passed points at a missing error pattern.

const d = require('better-sqlite3')('data/eval.db');
d.pragma('foreign_keys = ON');

d.exec(`
CREATE TABLE IF NOT EXISTS audit_feedback (
  id             TEXT PRIMARY KEY,
  bot_id         TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  interaction_id TEXT NOT NULL,
  auditor        TEXT NOT NULL,
  verdict        TEXT NOT NULL CHECK (verdict IN ('pass','fail','partial')),
  error_label    TEXT,
  severity       TEXT,
  remarks        TEXT,
  source_file    TEXT,
  audited_at     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (bot_id, interaction_id, auditor)
);
CREATE INDEX IF NOT EXISTS idx_af_bot        ON audit_feedback(bot_id);
CREATE INDEX IF NOT EXISTS idx_af_interaction ON audit_feedback(interaction_id);
`);

// Remembers how a given spreadsheet's headers map onto the columns above, so
// the same sheet format only has to be mapped once.
d.exec(`
CREATE TABLE IF NOT EXISTS audit_import_maps (
  id         TEXT PRIMARY KEY,
  bot_id     TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mapping    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// The grader's current verdict per call, one row per interaction — the latest
// run wins, because the grader changed over the re-runs and older gradings
// are stale.
d.exec(`DROP VIEW IF EXISTS latest_results`);
d.exec(`
CREATE VIEW latest_results AS
SELECT r.id AS result_id, r.passed, r.failures, r.test_case_id,
       ru.id AS run_id, ru.bot_id, ru.prompt_version_id, ru.interaction_id,
       ru.call_duration_s, ru.bot_outcome, ru.started_at
FROM results r
JOIN runs ru ON ru.id = r.run_id
WHERE ru.interaction_id IS NOT NULL
  AND ru.id = (
    SELECT id FROM runs r2
    WHERE r2.interaction_id = ru.interaction_id AND r2.bot_id = ru.bot_id
    ORDER BY r2.started_at DESC, r2.rowid DESC LIMIT 1
  )
`);

// Grader verdict beside human verdict, one row per call per auditor.
// 'partial' counts as a fail on the human side: the auditor found something.
d.exec(`DROP VIEW IF EXISTS agreement`);
d.exec(`
CREATE VIEW agreement AS
SELECT
  af.bot_id,
  af.interaction_id,
  af.auditor,
  af.verdict            AS human_verdict,
  af.error_label,
  af.severity,
  af.remarks,
  lr.passed             AS grader_passed,
  lr.test_case_id,
  lr.failures,
  lr.started_at,
  CASE
    WHEN lr.passed IS NULL                                    THEN 'ungraded'
    WHEN af.verdict = 'pass'  AND lr.passed = 1               THEN 'agree_pass'
    WHEN af.verdict <> 'pass' AND lr.passed = 0               THEN 'agree_fail'
    WHEN af.verdict <> 'pass' AND lr.passed = 1               THEN 'false_pass'
    ELSE                                                            'false_fail'
  END AS cell
FROM audit_feedback af
LEFT JOIN latest_results lr
  ON lr.interaction_id = af.interaction_id AND lr.bot_id = af.bot_id
`);

console.log('tables:', d.prepare(
  "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name IN ('audit_feedback','audit_import_maps','latest_results','agreement')"
).all().map(r => r.name));

console.log('graded calls available to join against:', d.prepare(
  'SELECT bot_id, COUNT(*) n FROM latest_results GROUP BY 1'
).all());

console.log('feedback rows so far:', d.prepare(
  'SELECT COUNT(*) n FROM audit_feedback'
).get());