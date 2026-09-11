const fs = require('fs');
const d = require('better-sqlite3')('data/eval.db');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const lines = fs.readFileSync('audit.csv', 'utf8').split(/\r?\n/);

const sheetIds = new Set();
for (const l of lines) {
  const m = l.match(UUID);
  if (m) sheetIds.add(m[0].toLowerCase());
}

const graded = d.prepare('SELECT DISTINCT interaction_id FROM latest_results').all()
  .map(r => r.interaction_id);

const overlap = graded.filter(id => sheetIds.has(id));

console.log('audited calls in sheet:', sheetIds.size);
console.log('calls graded by platform:', graded.length);
console.log('OVERLAP:', overlap.length);
console.log('sample overlap:', overlap.slice(0, 5));