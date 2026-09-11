const d = require('better-sqlite3')('data/eval.db');

// For calls that flipped: did the detected test case change too?
console.log('flow stability on flipped calls:', d.prepare(`
  SELECT COUNT(*) flipped_calls,
         SUM(CASE WHEN flows > 1 THEN 1 ELSE 0 END) also_changed_flow
  FROM (
    SELECT ru.interaction_id,
           COUNT(DISTINCT r.passed) verdicts,
           COUNT(DISTINCT r.test_case_id) flows
    FROM results r JOIN runs ru ON ru.id = r.run_id
    WHERE ru.interaction_id IS NOT NULL
    GROUP BY ru.interaction_id
    HAVING verdicts > 1
  )`).get());

// One call in detail, oldest grading to newest.
const example = d.prepare(`
  SELECT ru.interaction_id FROM results r JOIN runs ru ON ru.id = r.run_id
  WHERE ru.interaction_id IS NOT NULL
  GROUP BY ru.interaction_id HAVING COUNT(DISTINCT r.passed) > 1 LIMIT 1
`).get();

console.log('example call:', example.interaction_id);
console.table(d.prepare(`
  SELECT ru.started_at, r.test_case_id, r.passed,
         SUBSTR(r.failures,1,80) AS first_failures
  FROM results r JOIN runs ru ON ru.id = r.run_id
  WHERE ru.interaction_id = ?
  ORDER BY ru.started_at
`).all(example.interaction_id));