const d = require('better-sqlite3')('data/eval.db');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const rows = d.prepare(`
  SELECT r.id, r.transcript FROM results r
  JOIN runs ru ON ru.id = r.run_id
  WHERE ru.bot_id = 'sameeksha'
`).all();

let hit = 0, miss = 0;
const samples = [];

for (const r of rows) {
  const m = (r.transcript || '').match(UUID);
  if (m) {
    hit++;
    if (samples.length < 3) samples.push(m[0]);
  } else {
    miss++;
  }
}

console.log({ total: rows.length, withUuid: hit, without: miss });
console.log('sample ids:', samples);

// What a transcript actually looks like, so we can see what else is in there.
const one = rows[0];
console.log('--- first 400 chars of one transcript ---');
console.log((one?.transcript || '').slice(0, 400));