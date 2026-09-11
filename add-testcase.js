const db = require('better-sqlite3')('./data/eval.db');
const bot = db.prepare('SELECT id FROM bots WHERE name = ?').get('Sameeksha');
if (!bot) { console.log('Bot not found'); process.exit(1); }

db.prepare(`INSERT INTO test_cases (id, bot_id, spec, approved_by, approved_at) 
  VALUES ('tc-1', ?, ?, 'manual', datetime('now'))`)
  .run(bot.id, JSON.stringify({
    id: 'TC-01',
    scenario_type: 'happy_path',
    priority: 'P0',
    must_say: ['pre-employment', 'health checkup'],
    must_not_say: ['unable', 'failed'],
    expected_tools: ['get_appointment'],
    expect_terminal_state: true
  }));

console.log('Test case added');