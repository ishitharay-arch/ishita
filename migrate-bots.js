// Adds use_case and prd to the bots table.
// Safe to run more than once — it checks before altering.
//   node migrate-bots.js
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'eval.db'));

const cols = db.prepare('PRAGMA table_info(bots)').all().map(c => c.name);

if (!cols.includes('use_case')) {
  db.exec("ALTER TABLE bots ADD COLUMN use_case TEXT NOT NULL DEFAULT ''");
  console.log('added bots.use_case');
} else {
  console.log('bots.use_case already exists');
}

if (!cols.includes('prd')) {
  db.exec("ALTER TABLE bots ADD COLUMN prd TEXT NOT NULL DEFAULT ''");
  console.log('added bots.prd');
} else {
  console.log('bots.prd already exists');
}

console.log('\nbots columns:', db.prepare('PRAGMA table_info(bots)').all().map(c => c.name).join(', '));
console.log('bots:', db.prepare('SELECT id, name, department FROM bots').all());
