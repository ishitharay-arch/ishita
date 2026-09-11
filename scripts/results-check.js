const d = require('better-sqlite3')('data/eval.db');

console.log('orphan results:', d.prepare(`
  SELECT COUNT(*) n FROM results r
  LEFT JOIN test_cases tc ON tc.id = r.test_case_id
  WHERE tc.id IS NULL
`).get());

console.log('results per bot:', d.prepare(`
  SELECT tc.bot_id, COUNT(*) n FROM results r
  JOIN test_cases tc ON tc.id = r.test_case_id GROUP BY 1
`).all());

console.log('tables:', d.prepare(
  "SELECT name FROM sqlite_master WHERE type='table'"
).all().map(t => t.name));