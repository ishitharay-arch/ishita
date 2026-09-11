const d = require('better-sqlite3')('data/eval.db');
const r = d.prepare(
  "UPDATE runs SET bot_model = 'Sameeksha' WHERE bot_model = 'CS_PEHC_Pre-booking'"
).run();
console.log('rows updated:', r.changes);
console.log(d.prepare('SELECT bot_model, COUNT(*) n FROM runs GROUP BY 1').all());