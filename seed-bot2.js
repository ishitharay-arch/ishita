const db = require('better-sqlite3')('./data/eval.db');
db.prepare("INSERT OR IGNORE INTO bots (id, name, department, created_at) VALUES ('sameeksha', 'Sameeksha', 'Customer Support', datetime('now'))").run();
console.log('Done:', db.prepare('SELECT * FROM bots').all());
