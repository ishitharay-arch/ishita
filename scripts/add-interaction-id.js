const d = require('better-sqlite3')('data/eval.db');
d.pragma('foreign_keys = ON');

const cols = (t) => d.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);

if (!cols('runs').includes('interaction_id')) {
  d.exec('ALTER TABLE runs ADD COLUMN interaction_id TEXT');
  d.exec('ALTER TABLE runs ADD COLUMN call_duration_s INTEGER');
  d.exec('ALTER TABLE runs ADD COLUMN bot_outcome TEXT');
  d.exec('CREATE INDEX IF NOT EXISTS idx_runs_interaction ON runs(interaction_id)');
  console.log('runs: columns added');
}
if (!cols('transcripts').includes('interaction_id')) {
  d.exec('ALTER TABLE transcripts ADD COLUMN interaction_id TEXT');
  console.log('transcripts: column added');
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const DUR  = /Duration:\s*(\d+)\s*s/i;
const OUT  = /Outcome:\s*([^"\\}]+)/i;

const rows = d.prepare(`
  SELECT r.run_id, r.transcript FROM results r
  JOIN runs ru ON ru.id = r.run_id
  WHERE ru.interaction_id IS NULL
`).all();

const upd = d.prepare(`UPDATE runs SET interaction_id = ?, call_duration_s = ?, bot_outcome = ?
                       WHERE id = ?`);

let done = 0, skipped = 0;
d.transaction(() => {
  for (const r of rows) {
    const t = r.transcript || '';
    const id = t.match(UUID)?.[0];
    if (!id) { skipped++; continue; }
    const dur = t.match(DUR)?.[1];
    const out = t.match(OUT)?.[1]?.trim() || null;
    upd.run(id.toLowerCase(), dur ? parseInt(dur, 10) : null, out, r.run_id);
    done++;
  }
})();

console.log({ backfilled: done, skipped });
console.log('duplicate interaction_ids (same call graded twice):',
  d.prepare(`SELECT interaction_id, COUNT(*) n FROM runs
             WHERE interaction_id IS NOT NULL
             GROUP BY 1 HAVING n > 1 ORDER BY n DESC LIMIT 5`).all());
console.log('outcomes seen:',
  d.prepare('SELECT bot_outcome, COUNT(*) n FROM runs GROUP BY 1').all());