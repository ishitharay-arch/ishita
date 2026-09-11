// Converts the two hardcoded regression checks in auto-grade/route.ts into
// Error KB rows. Run once:  node seed-error-patterns.js
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

const db = new Database(path.join(__dirname, 'data', 'eval.db')); // adjust if your db path differs

const BOT_NAME = 'Sameeksha';
const bot = db.prepare('SELECT id FROM bots WHERE name = ?').get(BOT_NAME);
if (!bot) {
  console.error(`No bot named "${BOT_NAME}". Check the bots table.`);
  process.exit(1);
}

const patterns = [
  {
    name: 'PEHC-21',
    description: 'Bot repeats the same line twice in a row, excluding hold and transfer phrases.',
    severity: 'critical',
    error_type: 'repetition',
    stage: 'any',
    detection_method: 'behavioral',
    detection_config: JSON.stringify({
      check: 'consecutive_repeat',
      min_length: 20,
      snippet_length: 120,
      exclude_phrases: [
        'still working on',
        'apologize for the delay',
        'stay on the line',
        'are you still there',
        'bear with me',
        'hold for',
        "didn't catch that",
        'could not capture'
      ]
    })
  },
  {
    name: 'PEHC-25',
    description: 'If a ticket is raised, the bot must state the 24-hour callback window.',
    severity: 'major',
    error_type: 'compliance',
    stage: 'resolution',
    detection_method: 'keyword',
    detection_config: JSON.stringify({
      target: 'bot',
      if_present: ['ticket'],
      required: ['24 hours', 'twenty-four hours', '24hours'],
      detail: 'Ticket raised but 24-hour timeframe not mentioned'
    })
  }
];

const insert = db.prepare(`
  INSERT INTO error_patterns
    (id, bot_id, name, description, severity, error_type, stage,
     detection_method, detection_config, source, active, times_triggered)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, 0)
`);

const existing = db.prepare('SELECT name FROM error_patterns WHERE bot_id = ? AND name = ?');

for (const p of patterns) {
  if (existing.get(bot.id, p.name)) {
    console.log(`${p.name} already exists, skipping`);
    continue;
  }
  insert.run(
    crypto.randomUUID(),
    bot.id,
    p.name,
    p.description,
    p.severity,
    p.error_type,
    p.stage,
    p.detection_method,
    p.detection_config
  );
  console.log(`Seeded ${p.name}`);
}

const count = db.prepare('SELECT COUNT(*) AS n FROM error_patterns WHERE bot_id = ?').get(bot.id);
console.log(`\n${count.n} active patterns for ${BOT_NAME}`);
