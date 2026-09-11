// llm_verdicts had nowhere to store the qualitative 1-5 scores an LLM grader
// produces (only verdict/failures/summary/remarks) — add a column for them,
// same shape as results.soft_scores.
//
//   node scripts/add-llm-verdict-soft-scores.js

const d = require('better-sqlite3')('data/eval.db');

const cols = d.prepare('PRAGMA table_info(llm_verdicts)').all().map(c => c.name);

if (cols.includes('soft_scores')) {
  console.log('llm_verdicts.soft_scores already exists, nothing to do');
} else {
  d.exec(`ALTER TABLE llm_verdicts ADD COLUMN soft_scores TEXT`);
  console.log('added llm_verdicts.soft_scores column');
}

console.log(d.prepare('PRAGMA table_info(llm_verdicts)').all());
