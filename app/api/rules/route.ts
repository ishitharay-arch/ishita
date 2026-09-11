import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * GET /api/rules?botId=...
 *
 * Everything the grader checks against, for one bot, in one place:
 * test cases (per-scenario) and error patterns (cross-cutting).
 *
 * The point of combining them is the health data. A test case with no rules
 * passes every call matched to it. A pattern that has never fired may be
 * dead. A pattern that fires on calls the audit team was happy with is too
 * aggressive. None of that is visible when the two lists live apart.
 */
export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get('botId');

    const bots = db.prepare(
      'SELECT id, name FROM bots ORDER BY name'
    ).all() as { id: string; name: string }[];

    if (!botId) {
      return NextResponse.json(
        { success: false, error: 'botId is required', bots },
        { status: 400 }
      );
    }
    const bot = bots.find(b => b.id === botId);
    if (!bot) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botId}`, bots },
        { status: 404 }
      );
    }

    // ---- test cases ----
    const rawCases = db.prepare(`
      SELECT id, spec, approved_by, approved_at, created_at
      FROM test_cases WHERE bot_id = ? ORDER BY id
    `).all(bot.id) as any[];

    // How often each test case has been the detected flow, and how it fared.
    const caseStats = db.prepare(`
      SELECT test_case_id, COUNT(*) AS calls, SUM(passed) AS passed
      FROM latest_results WHERE bot_id = ? GROUP BY test_case_id
    `).all(bot.id) as any[];
    const statFor = (id: string) => caseStats.find(s => s.test_case_id === id);

    const testCases = rawCases.map(r => {
      let spec: any = {};
      let parseError = false;
      try { spec = JSON.parse(r.spec); } catch { parseError = true; }

      const mustSay = spec.must_say || [];
      const mustNotSay = spec.must_not_say || [];
      const tools = spec.expected_tools || [];
      const terminal = spec.expect_terminal_state ? 1 : 0;
      const ruleCount = mustSay.length + mustNotSay.length + tools.length + terminal;

      const st = statFor(r.id);
      const calls = st?.calls ?? 0;
      const passed = st?.passed ?? 0;

      return {
        id: r.id,
        scenario: spec.scenario_type || null,
        priority: spec.priority || null,
        description: spec.description || null,
        goal: spec.goal || null,
        mustSay, mustNotSay, tools,
        expectTerminal: !!spec.expect_terminal_state,
        ruleCount,
        calls,
        passed,
        passRate: calls ? (passed / calls) * 100 : null,
        approved: !!r.approved_by,
        // A case with no rules passes anything matched to it. That is worse
        // than having no case at all, because it looks like coverage.
        unruled: ruleCount === 0,
        parseError,
        // Matched calls but has no rules — actively inflating the pass rate.
        inflating: ruleCount === 0 && calls > 0,
        // Never matched a call: either the flow never happens, or detection
        // has no rule pointing at it.
        neverMatched: calls === 0
      };
    });

    // ---- flow rules, so a test case that can never be detected is visible ----
    const flowRuleCounts = db.prepare(`
      SELECT test_case_id, COUNT(*) AS n FROM flow_rules
      WHERE bot_id = ? AND active = 1 GROUP BY test_case_id
    `).all(bot.id) as any[];
    const flowRuleFor = (id: string) =>
      flowRuleCounts.find(f => f.test_case_id === id)?.n ?? 0;

    for (const tc of testCases as any[]) {
      tc.flowRules = flowRuleFor(tc.id);
      tc.undetectable = tc.flowRules === 0;
    }

    // ---- error patterns ----
    const patterns = db.prepare(`
      SELECT id, name, description, severity, error_type, stage,
             detection_method, detection_config, source, active,
             times_triggered, created_at, updated_at
      FROM error_patterns WHERE bot_id = ? ORDER BY active DESC, name
    `).all(bot.id) as any[];

    // Patterns whose failures show up on calls the audit team passed —
    // the ones generating noise rather than signal.
    const overFlagged = db.prepare(`
      SELECT failures FROM agreement
      WHERE bot_id = ? AND cell = 'false_fail'
    `).all(bot.id) as any[];

    const noiseByPattern: Record<string, number> = {};
    for (const row of overFlagged) {
      let list: string[] = [];
      try { list = JSON.parse(row.failures || '[]'); } catch { list = []; }
      for (const f of list) {
        const label = f.split(':')[0].trim().toLowerCase();
        noiseByPattern[label] = (noiseByPattern[label] || 0) + 1;
      }
    }

    const enrichedPatterns = patterns.map(p => {
      let config: any = null;
      let phrases: string[] = [];
      try {
        config = JSON.parse(p.detection_config);
        const arrayKey = Object.keys(config).find(k => Array.isArray(config[k]));
        if (arrayKey) phrases = config[arrayKey];
      } catch { /* leave null */ }

      return {
        ...p,
        active: !!p.active,
        phrases,
        config,
        noiseCount: noiseByPattern[p.name.toLowerCase()] || 0,
        neverTriggered: p.times_triggered === 0,
        fromAudit: p.source === 'audit'
      };
    });

    // ---- coverage gap: audit labels with no pattern ----
    const patternNames = new Set(patterns.map(p => p.name.toLowerCase()));
    const auditLabels = db.prepare(`
      SELECT error_label, COUNT(*) AS n,
             SUM(CASE WHEN detect_phrase IS NOT NULL AND detect_phrase <> '' THEN 1 ELSE 0 END) AS with_phrase
      FROM audit_feedback
      WHERE bot_id = ? AND error_label IS NOT NULL AND error_label <> ''
      GROUP BY error_label ORDER BY n DESC
    `).all(bot.id) as any[];

    const uncovered = auditLabels.filter(
      l => !patternNames.has(l.error_label.toLowerCase())
    );

    const health = {
      testCases: testCases.length,
      unruled: testCases.filter((t: any) => t.unruled).length,
      inflating: testCases.filter((t: any) => t.inflating).length,
      undetectable: testCases.filter((t: any) => t.undetectable).length,
      patterns: enrichedPatterns.length,
      activePatterns: enrichedPatterns.filter(p => p.active).length,
      neverTriggered: enrichedPatterns.filter(p => p.neverTriggered && p.active).length,
      noisy: enrichedPatterns.filter(p => p.noiseCount > 0).length,
      uncoveredLabels: uncovered.length
    };

    return NextResponse.json({
      success: true,
      bots,
      bot,
      health,
      testCases,
      patterns: enrichedPatterns,
      uncoveredLabels: uncovered
    });
  } catch (error) {
    console.error('Error in rules:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}