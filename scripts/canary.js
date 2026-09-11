const d = require('better-sqlite3')('data/eval.db');
d.pragma('foreign_keys = ON');

const add = process.argv[2] !== 'remove';

if (add) {
  d.prepare(`INSERT INTO bots (id, name, department, use_case, prd, created_at)
             VALUES ('canary','CANARY - delete me','Customer Support',
                     'scoping test','none',datetime('now'))`).run();

  d.prepare(`INSERT INTO prompt_versions (id, bot_id, version, body, is_live, created_at)
             VALUES ('canary-pv1','canary',1,'canary prompt',1,datetime('now'))`).run();

  const ins = d.prepare(`INSERT INTO test_cases (id, bot_id, spec, created_at)
                         VALUES (?,?,?,datetime('now'))`);
  ['CAN-01','CAN-02','CAN-03'].forEach(c =>
    ins.run(c, 'canary', JSON.stringify({
      id: c, scenario_type: 'canary_scope_test', priority: 'P3',
      description: 'Canary case — must never appear under another bot'
    }))
  );
  console.log('canary added');
} else {
  d.prepare("DELETE FROM bots WHERE id = 'canary'").run();
  console.log('canary removed (cascades through its rows)');
}

console.log(d.prepare('SELECT bot_id, COUNT(*) n FROM test_cases GROUP BY 1').all());