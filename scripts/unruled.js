const d = require('better-sqlite3')('data/eval.db');

const specs = d.prepare(
  "SELECT id, spec FROM test_cases WHERE bot_id='sameeksha'"
).all();

const unruled = [];
for (const row of specs) {
  const s = JSON.parse(row.spec);
  const n = (s.must_say||[]).length + (s.must_not_say||[]).length +
            (s.expected_tools||[]).length + (s.expect_terminal_state?1:0);
  if (n === 0) unruled.push({ id: row.id, scenario: s.scenario_type });
}
console.log('unruled test cases:', unruled);

console.log('latest verdict by test case:', d.prepare(`
  SELECT test_case_id, COUNT(*) calls, SUM(passed) passed
  FROM latest_results WHERE bot_id='sameeksha'
  GROUP BY 1 ORDER BY calls DESC
`).all());