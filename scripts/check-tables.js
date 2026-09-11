const d = require('better-sqlite3')('data/eval.db');
console.log(d.prepare(
  "SELECT type, name FROM sqlite_master WHERE name LIKE 'audit%' OR name IN ('agreement','latest_results')"
).all());
console.log('rows:', d.prepare('SELECT COUNT(*) n FROM audit_feedback').get());