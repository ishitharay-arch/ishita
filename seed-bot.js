const db = require('better-sqlite3')('./data/eval.db');
db.prepare("INSERT OR IGNORE INTO bots (id, name, department, created_at) VALUES ('cs-pehc-prebook', 'CS_PEHC_Pre-booking', 'Customer Support', datetime('now'))").run();
console.log('Bots:', db.prepare('SELECT * FROM bots').all());
