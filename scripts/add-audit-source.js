// Linked audit sheets. A source is one published-CSV tab plus the mapping
// that turns its columns and flow names into audit_feedback rows.
//
//   node scripts/add-audit-source.js
//
// Re-syncing the same source updates existing rows rather than duplicating
// them, so editing a remark in the sheet and hitting Sync changes the stored
// feedback. That is the whole point of linking rather than uploading.

const d = require('better-sqlite3')('data/eval.db');
d.pragma('foreign_keys = ON');

d.exec(`
CREATE TABLE IF NOT EXISTS audit_sources (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  url            TEXT NOT NULL,
  column_map     TEXT NOT NULL,
  flow_map       TEXT NOT NULL,
  default_auditor TEXT,
  last_synced_at TEXT,
  last_result    TEXT,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// No bot_id on the source: one sheet covers the whole fleet, and flow_map
// decides which rows belong to which bot.

const seed = d.prepare(`
  INSERT OR IGNORE INTO audit_sources
    (id, name, url, column_map, flow_map, default_auditor)
  VALUES (?,?,?,?,?,?)
`);

seed.run(
  'cs-voicebots-callaudits',
  'CS_Voicebots — CallAudits_A&I',
  '',  // paste the published CSV URL here, or set it from the UI
  JSON.stringify({
    interaction_id: 'InteractionID',
    remarks: 'Remarks',
    flow: 'Flow Name',
    audited_at: 'Date',
    auditor: 'Team'
  }),
  JSON.stringify({
    // Flow Name in the sheet  ->  bot id in the platform.
    // Add a line per flow as you register each bot. Unmapped flows are
    // skipped and counted, never guessed at.
    'CS_PEHC_Pre-booking': 'sameeksha'
  }),
  'CS'
);

console.log('sources:', d.prepare(
  'SELECT id, name, url, last_synced_at FROM audit_sources'
).all());

console.log('\nNext: paste the published CSV URL into audit_sources.url');
console.log('In the sheet: File > Share > Publish to web > pick the tab > CSV');