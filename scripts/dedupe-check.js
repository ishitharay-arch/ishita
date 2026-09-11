const d = require('better-sqlite3')('data/eval.db');

// Latest run per call, per bot.
d.exec(`DROP VIEW IF EXISTS latest_results`);
d.exec(`
CREATE VIEW latest_results AS
SELECT r.*, ru.bot_id, ru.prompt_version_id, ru.interaction_id,
       ru.call_duration_s, ru.bot_outcome, ru.started_at
FROM results r
JOIN runs ru ON ru.id = r.run_id
WHERE ru.interaction_id IS NOT NULL
  AND ru.id = (
    SELECT id FROM runs r2
    WHERE r2.interaction_id = ru.interaction_id AND r2.bot_id = ru.bot_id
    ORDER BY r2.started_at DESC, r2.rowid DESC LIMIT 1
  )
`);

console.log('unique calls:', d.prepare(
  'SELECT bot_id, COUNT(*) n FROM latest_results GROUP BY 1').all());

console.log('deduped pass rate:', d.prepare(`
  SELECT bot_id, COUNT(*) total, SUM(passed) passed,
         ROUND(100.0*SUM(passed)/COUNT(*),1) pct
  FROM latest_results GROUP BY 1`).all());

console.log('inflated (all runs):', d.prepare(`
  SELECT COUNT(*) total, SUM(r.passed) passed,
         ROUND(100.0*SUM(r.passed)/COUNT(*),1) pct
  FROM results r JOIN runs ru ON ru.id = r.run_id
  WHERE ru.bot_id='sameeksha'`).get());

// Did the verdict change across the 18 gradings of the same call?
console.log('calls whose verdict flipped across re-grades:', d.prepare(`
  SELECT COUNT(*) n FROM (
    SELECT ru.interaction_id
    FROM results r JOIN runs ru ON ru.id = r.run_id
    WHERE ru.interaction_id IS NOT NULL
    GROUP BY ru.interaction_id
    HAVING COUNT(DISTINCT r.passed) > 1
  )`).get());