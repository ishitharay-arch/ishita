// Soft (LLM-judged) rules for Sameeksha — qualitative checks that a
// must_say/must_not_say phrase match can't express, informed by real
// failure modes found in a 30-call sample (pehc30.pdf):
//   - the bot narrating its own language switch ("I'll continue in English"),
//     which the prompt explicitly forbids but no hard rule checks for
//   - repeating the same clarifying question when the caller's intent is
//     already clear, instead of escalating
//   - tone/empathy, and whether the call reached a real resolution
//
//   node scripts/seed-soft-rules.js

const db = require('better-sqlite3')('./data/eval.db');
const { randomUUID } = require('crypto');

const bot = db.prepare('SELECT id FROM bots WHERE id = ?').get('sameeksha');
if (!bot) { console.log('Bot "sameeksha" not found.'); process.exit(1); }

const rules = [
  {
    name: 'No self-narration',
    body: 'The bot must never verbalize its own internal reasoning or language-switching decision — e.g. saying "I\'ll continue in English", "I\'ll switch to Hindi", "let me think", or any similar meta-commentary about what it is about to do. Score 5 if the transcript contains no such narration at all. Score 1 if it happens more than once. Quote the offending line in the reason if found.',
  },
  {
    name: 'Escalation persistence',
    body: 'When the caller expresses the same intent two or more times in different words (e.g. repeatedly asking for a human agent, or repeating an unanswered question), the bot should recognize this and change its response — escalate, acknowledge the repetition, or take a different action — rather than repeating an identical or near-identical clarifying question. Score 5 if the bot adapts appropriately. Score 1 if it loops the same question three or more times despite clear repeated intent from the caller.',
  },
  {
    name: 'Empathy and tone',
    body: 'The bot should sound calm, warm, and human, especially when the caller is frustrated, confused, or has had a bad experience (e.g. a failed appointment, a long wait). Score 5 for a consistently empathetic, natural tone. Score 1 if the bot sounds robotic, repetitive, or ignores clear caller frustration.',
  },
  {
    name: 'Clean call resolution',
    body: 'The call should end in a clear outcome for the caller — their question answered, a next step given (HR contact, WhatsApp doc, ticket raised), or a clean handoff — rather than trailing off mid-loop, hitting a generic network-issue failure message, or ending on an unresolved dead end. Score 5 for a clear resolution. Score 1 if the call never reaches any resolution for the caller\'s actual request.',
  },
];

const insert = db.prepare(`
  INSERT INTO rules (id, bot_id, kind, body, name, active)
  VALUES (?, ?, 'soft', ?, ?, 1)
`);

const existing = db.prepare(`SELECT name FROM rules WHERE bot_id = ? AND kind = 'soft'`).all(bot.id).map(r => r.name);

let added = 0;
for (const rule of rules) {
  if (existing.includes(rule.name)) {
    console.log(`Skipped "${rule.name}" — already exists`);
    continue;
  }
  insert.run(randomUUID(), bot.id, rule.body, rule.name);
  added++;
}

console.log(`Added ${added} soft rule(s) out of ${rules.length}`);
console.log('Total soft rules for Sameeksha:',
  db.prepare(`SELECT COUNT(*) as c FROM rules WHERE bot_id = ? AND kind = 'soft' AND active = 1`).get(bot.id).c
);
