const d = require('better-sqlite3')('data/eval.db');

console.log('bot mismatch between run and test case:', d.prepare(`
  SELECT COUNT(*) n FROM results r
  JOIN runs ru ON ru.id = r.run_id
  JOIN test_cases tc ON tc.id = r.test_case_id
  WHERE ru.bot_id <> tc.bot_id
`).get());

console.log('runs per prompt version:', d.prepare(`
  SELECT pv.version, pv.is_live, COUNT(*) n
  FROM runs ru JOIN prompt_versions pv ON pv.id = ru.prompt_version_id
  GROUP BY 1,2 ORDER BY pv.version
`).all());

console.log('pass rate per version:', d.prepare(`
  SELECT pv.version,
         COUNT(*) total,
         SUM(r.passed) passed,
         ROUND(100.0 * SUM(r.passed) / COUNT(*), 1) pct
  FROM results r
  JOIN runs ru ON ru.id = r.run_id
  JOIN prompt_versions pv ON pv.id = ru.prompt_version_id
  GROUP BY 1 ORDER BY pv.version
`).all());

console.log('models used:', d.prepare(
  'SELECT bot_model, judge_model, COUNT(*) n FROM runs GROUP BY 1,2'
).all());