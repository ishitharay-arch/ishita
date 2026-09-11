import { NextRequest, NextResponse } from 'next/server'
import db, { parseJson } from '@/lib/db'

/**
 * GET /api/llm-verdicts?botId=xxx
 *
 * Returns Claude's grading verdicts for a bot — the LLM-assisted layer that
 * sits alongside the deterministic hard-rule grade (results.passed) and the
 * human ground truth (audit_feedback), for the same calls.
 */
export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  if (!botId) {
    return NextResponse.json({ success: false, error: 'botId required' }, { status: 400 })
  }

  try {
    const rows = db.prepare(`
      SELECT id, bot_id, result_id, run_id, test_case_id, verdict, detected_flow,
             confidence, failures, summary, remarks, interaction_id, soft_scores,
             created_at
      FROM llm_verdicts
      WHERE bot_id = ?
      ORDER BY created_at DESC
    `).all(botId) as any[]

    const verdicts = rows.map(r => ({
      ...r,
      failures: parseJson<string[]>(r.failures) || [],
      soft_scores: parseJson<{ ruleName: string; score: number; reason: string }[]>(r.soft_scores) || [],
    }))

    const counts = { pass: 0, fail: 0, partial: 0, unknown: 0 }
    for (const v of verdicts) {
      if (v.verdict in counts) counts[v.verdict as keyof typeof counts]++
      else counts.unknown++
    }

    const softTotals: Record<string, { sum: number; n: number }> = {}
    for (const v of verdicts) {
      for (const s of v.soft_scores) {
        softTotals[s.ruleName] = softTotals[s.ruleName] || { sum: 0, n: 0 }
        softTotals[s.ruleName].sum += s.score
        softTotals[s.ruleName].n += 1
      }
    }
    const softAverages = Object.fromEntries(
      Object.entries(softTotals).map(([name, { sum, n }]) => [name, Math.round((sum / n) * 100) / 100])
    )

    return NextResponse.json({ success: true, verdicts, counts, softAverages })
  } catch (error) {
    console.error('Error fetching LLM verdicts:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
