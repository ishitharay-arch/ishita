const d = require('better-sqlite3')('data/eval.db');
console.log(d.prepare(`
  SELECT bot_id, COUNT(*) AS live_count
  FROM prompt_versions WHERE is_live = 1 GROUP BY bot_id
`).all());