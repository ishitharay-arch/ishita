const d = require('better-sqlite3')('data/eval.db');
console.log(d.prepare(
  "SELECT interaction_id, test_case_id, passed FROM latest_results WHERE bot_id='sameeksha' LIMIT 15"
).all());