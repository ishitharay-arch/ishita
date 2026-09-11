const d = require('better-sqlite3')('data/eval.db');
for (const t of ['test_cases','error_patterns','results','transcripts','prompt_versions']) {
  console.log('===', t);
  console.log(d.prepare(`PRAGMA table_info(${t})`).all().map(c => `${c.name} notnull=${c.notnull}`));
  console.log('fks:', d.prepare(`PRAGMA foreign_key_list(${t})`).all().length);
}