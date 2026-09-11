const d = require('better-sqlite3')('data/eval.db');

for (const t of ['runs','rules','bots']) {
  console.log('===', t);
  console.log(d.prepare(`PRAGMA table_info(${t})`).all().map(c => `${c.name} notnull=${c.notnull}`));
  console.log('fks:', d.prepare(`PRAGMA foreign_key_list(${t})`).all());
}

console.log('runs count:', d.prepare('SELECT COUNT(*) n FROM runs').get());
console.log('results per run:', d.prepare(`
  SELECT run_id, COUNT(*) n FROM results GROUP BY 1 ORDER BY n DESC LIMIT 10
`).all());