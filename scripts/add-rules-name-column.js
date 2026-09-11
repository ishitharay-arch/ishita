// Fix: app/api/grade/route.ts and lib/gradeSoft.ts read `rules.name`, but the
// `rules` table was never given a `name` column (only bot_id, kind, body,
// active) — every call to POST /api/grade throws "no such column: name" the
// instant it tries to load soft rules, before any LLM call happens.
//
//   node scripts/add-rules-name-column.js

const d = require('better-sqlite3')('data/eval.db');

const cols = d.prepare('PRAGMA table_info(rules)').all().map(c => c.name);

if (cols.includes('name')) {
  console.log('rules.name already exists, nothing to do');
} else {
  d.exec(`ALTER TABLE rules ADD COLUMN name TEXT`);

  // Backfill any existing rows with a short name derived from body, so old
  // rows (if any) don't show up blank in the grading prompt.
  const rows = d.prepare(`SELECT id, body FROM rules WHERE name IS NULL`).all();
  const update = d.prepare(`UPDATE rules SET name = ? WHERE id = ?`);
  for (const row of rows) {
    const derived = row.body.length > 60 ? row.body.slice(0, 57) + '...' : row.body;
    update.run(derived, row.id);
  }

  console.log(`added rules.name column, backfilled ${rows.length} row(s)`);
}

console.log(d.prepare('PRAGMA table_info(rules)').all());
