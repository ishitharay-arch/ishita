// Audit entries recorded in the platform itself, with the columns the QC team
// actually uses. No spreadsheet required — though CSV upload still works and
// writes to the same table.
//
//   node scripts/add-audit-entry-fields.js
//
// On how a remark reaches the grader:
// A free-text remark cannot be checked by a deterministic grader. What can be
// checked is a phrase. So an entry carries an optional detect_phrase — the
// words that gave the issue away — and once that is filled in, the entry can
// be promoted to an error pattern with one click and every future call is
// checked against it. Remarks stay as evidence; the phrase is what grades.

const d = require('better-sqlite3')('data/eval.db');
d.pragma('foreign_keys = ON');

const tableExists = (t) =>
  !!d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);

if (!tableExists('audit_feedback')) {
  console.error('audit_feedback does not exist. Run add-audit-feedback.js first.');
  process.exit(1);
}

// A view built on audit_feedback blocks the table rebuild below, so it goes
// first and is recreated at the end. This is what the previous run tripped on.
d.exec('DROP VIEW IF EXISTS agreement');

const cols = d.prepare("PRAGMA table_info(audit_feedback)").all().map(c => c.name);

const additions = [
  ['department',     "TEXT"],
  ['use_case',       "TEXT"],
  ['bot_name',       "TEXT"],
  ['detect_phrase',  "TEXT"],
  ['promoted_to',    "TEXT"],   // error_patterns.id once promoted
  ['entered_via',    "TEXT"]    // 'form' | 'csv'
];

for (const [name, type] of additions) {
  if (!cols.includes(name)) {
    d.exec(`ALTER TABLE audit_feedback ADD COLUMN ${name} ${type}`);
    console.log('added', name);
  }
}

// verdict was NOT NULL with a CHECK. Entries typed in by hand often start as
// just "here is what went wrong" with no verdict decided, so allow it to be
// absent by rebuilding without the constraint.
const info = d.prepare("SELECT sql FROM sqlite_master WHERE name='audit_feedback'").get();
if (info && /verdict\s+TEXT\s+NOT NULL/i.test(info.sql)) {
  console.log('relaxing verdict to nullable...');
  d.exec('PRAGMA foreign_keys=OFF');
  d.transaction(() => {
    d.exec(`
      CREATE TABLE audit_feedback_new (
        id             TEXT PRIMARY KEY,
        bot_id         TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        interaction_id TEXT NOT NULL,
        auditor        TEXT NOT NULL,
        verdict        TEXT CHECK (verdict IS NULL OR verdict IN ('pass','fail','partial')),
        error_label    TEXT,
        severity       TEXT,
        remarks        TEXT,
        department     TEXT,
        use_case       TEXT,
        bot_name       TEXT,
        detect_phrase  TEXT,
        promoted_to    TEXT,
        entered_via    TEXT,
        source_file    TEXT,
        audited_at     TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (bot_id, interaction_id, auditor)
      )`);
    d.exec(`
      INSERT INTO audit_feedback_new
        (id, bot_id, interaction_id, auditor, verdict, error_label, severity,
         remarks, department, use_case, bot_name, detect_phrase, promoted_to,
         entered_via, source_file, audited_at, created_at)
      SELECT id, bot_id, interaction_id, auditor, verdict, error_label, severity,
         remarks, department, use_case, bot_name, detect_phrase, promoted_to,
         entered_via, source_file, audited_at, created_at
      FROM audit_feedback`);
    d.exec('DROP TABLE audit_feedback');
    d.exec('ALTER TABLE audit_feedback_new RENAME TO audit_feedback');
    d.exec('CREATE INDEX IF NOT EXISTS idx_af_bot ON audit_feedback(bot_id)');
    d.exec('CREATE INDEX IF NOT EXISTS idx_af_interaction ON audit_feedback(interaction_id)');
  })();
  d.exec('PRAGMA foreign_keys=ON');
}

// Entries with no verdict are labelled rather than counted as agreement or
// disagreement, so a plain "this went wrong" note never distorts the rate.
d.exec(`
CREATE VIEW agreement AS
SELECT
  af.bot_id, af.interaction_id, af.auditor,
  af.verdict AS human_verdict,
  af.error_label, af.severity, af.remarks, af.detect_phrase,
  lr.passed AS grader_passed, lr.test_case_id, lr.failures, lr.started_at,
  CASE
    WHEN af.verdict IS NULL                       THEN 'no_verdict'
    WHEN lr.passed IS NULL                        THEN 'ungraded'
    WHEN af.verdict = 'pass'  AND lr.passed = 1   THEN 'agree_pass'
    WHEN af.verdict <> 'pass' AND lr.passed = 0   THEN 'agree_fail'
    WHEN af.verdict <> 'pass' AND lr.passed = 1   THEN 'false_pass'
    ELSE                                               'false_fail'
  END AS cell
FROM audit_feedback af
LEFT JOIN latest_results lr
  ON lr.interaction_id = af.interaction_id AND lr.bot_id = af.bot_id
`);

console.log('columns now:',
  d.prepare("PRAGMA table_info(audit_feedback)").all().map(c => c.name).join(', '));
console.log('rows:', d.prepare('SELECT COUNT(*) n FROM audit_feedback').get());