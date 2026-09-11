const db = require('better-sqlite3')('./data/eval.db');
const bots = db.prepare('SELECT id, name FROM bots').all();
const ins = db.prepare(`
  INSERT OR IGNORE INTO prompt_versions (id, bot_id, version, body, is_live)
  VALUES (?, ?, 1, ?, 1)
`);
for (const b of bots) {
  ins.run(`pv-${b.id}-v1`, b.id, `Placeholder prompt for ${b.name}`);
}
console.log(db.prepare('SELECT id, bot_id, version, is_live FROM prompt_versions').all());
