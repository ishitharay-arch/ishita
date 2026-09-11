const d = require('better-sqlite3')('data/eval.db');
console.log('bots:', d.prepare('SELECT id, name, department FROM bots').all());
console.log('test cases:', d.prepare('SELECT bot_id, COUNT(*) n FROM test_cases GROUP BY 1').all());
console.log('prompt versions:', d.prepare('SELECT bot_id, version, is_live FROM prompt_versions').all());
console.log('flow rules:', d.prepare('SELECT bot_id, COUNT(*) n FROM flow_rules GROUP BY 1').all());
console.log('runs:', d.prepare('SELECT bot_id, COUNT(*) n FROM runs GROUP BY 1').all());