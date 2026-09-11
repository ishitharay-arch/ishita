import { NextRequest, NextResponse } from 'next/server'
import db, { generateId, stringifyJson } from '@/lib/db'

// Create the table on first import
db.exec(`
  CREATE TABLE IF NOT EXISTS llm_verdicts (
    id            TEXT PRIMARY KEY,
    bot_id        TEXT NOT NULL,
    result_id     TEXT,
    run_id        TEXT,
    test_case_id  TEXT,
    verdict       TEXT NOT NULL,
    detected_flow TEXT,
    confidence    REAL,
    failures      TEXT,
    summary       TEXT,
    remarks       TEXT,
    transcript    TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  )
`)

/**
 * POST /api/llm-verdict
 *
 * Stores Claude's grading verdict. Accepts the raw JSON that Claude
 * returned plus the bot/run context so it can be joined with the
 * deterministic grade on the same call.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      botId,
      resultId,   // optional — links to the deterministic grade
      runId,      // optional
      transcript, // the raw transcript text
      claudeVerdict,
    } = body

    if (!botId || !claudeVerdict) {
      return NextResponse.json(
        { success: false, error: 'botId and claudeVerdict required' },
        { status: 400 }
      )
    }

    // Parse the verdict — it should be JSON from Claude
    let parsed: any
    try {
      parsed = typeof claudeVerdict === 'string'
        ? JSON.parse(claudeVerdict)
        : claudeVerdict
    } catch {
      return NextResponse.json(
        { success: false, error: 'claudeVerdict is not valid JSON' },
        { status: 400 }
      )
    }

    const id = generateId()

    db.prepare(`
      INSERT INTO llm_verdicts
        (id, bot_id, result_id, run_id, test_case_id, verdict,
         detected_flow, confidence, failures, summary, remarks, transcript)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      botId,
      resultId || null,
      runId || null,
      parsed.detected_flow || null,
      parsed.verdict || 'unknown',
      parsed.detected_flow || null,
      parsed.confidence ?? null,
      stringifyJson(parsed.failures || []),
      parsed.summary || null,
      parsed.remarks || null,
      transcript || null,
    )

    return NextResponse.json({
      success: true,
      id,
      verdict: parsed.verdict,
      failures: parsed.failures || [],
    })
  } catch (error) {
    console.error('Error saving LLM verdict:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
