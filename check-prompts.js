const db = require('better-sqlite3')('./data/eval.db');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='prompt_versions'").get());
