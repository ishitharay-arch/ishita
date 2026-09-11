import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

/**
 * GET /api/llm-context?botId=xxx
 *
 * Returns everything Claude needs to grade a transcript:
 * bot info, system prompt, test cases, error patterns, flow rules.
 * The client assembles these into a prompt and copies to clipboard.
 */
export async function GET(request: NextRequest) {
  const botId = request.nextUrl.searchParams.get('botId')
  if (!botId) {
    return NextResponse.json({ success: false, error: 'botId required' }, { status: 400 })
  }

  try {
    // Bot info
    const bot = db.prepare('SELECT id, name, department FROM bots WHERE id = ?').get(botId) as any
    if (!bot) {
      return NextResponse.json({ success: false, error: 'Bot not found' }, { status: 404 })
    }

    // Latest prompt version
    const prompt = db.prepare(`
      SELECT * FROM prompt_versions
      WHERE bot_id = ? ORDER BY version DESC LIMIT 1
    `).get(botId) as any

    // All test cases for this bot
    const testCases = db.prepare(`
      SELECT id, spec FROM test_cases WHERE bot_id = ?
    `).all(botId) as { id: string; spec: string }[]

    const parsedTestCases = testCases.map(tc => ({
      id: tc.id,
      ...JSON.parse(tc.spec),
    }))


    // Error patterns for this bot
    const errorPatterns = db.prepare(`
      SELECT id, name, description, detection_config, severity, error_type
      FROM error_patterns WHERE bot_id = ? AND active = 1
    `).all(botId) as any[]

    // Flow rules for this bot
    const flowRules = db.prepare(`
      SELECT label, test_case_id, match_config, priority
      FROM flow_rules WHERE bot_id = ? AND active = 1
    `).all(botId) as any[]

    return NextResponse.json({
      success: true,
      bot,
      systemPrompt: prompt?.body || '(no prompt uploaded)',
      testCases: parsedTestCases,
      errorPatterns,
      flowRules,
    })
  } catch (error) {
    console.error('Error fetching LLM context:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
