import { NextRequest, NextResponse } from 'next/server'
import db, { generateId } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const botId = searchParams.get('botId')
    const activeOnly = searchParams.get('activeOnly') !== 'false'
    let query = 'SELECT * FROM error_patterns WHERE 1=1'
    const params: any[] = []
    if (botId) { query += ' AND bot_id = ?'; params.push(botId) }
    if (activeOnly) { query += ' AND active = 1' }
    query += ' ORDER BY severity DESC, times_triggered DESC, created_at DESC'
    const patterns = db.prepare(query).all(...params)
    return NextResponse.json({ patterns })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { botId, name, description, severity, errorType, stage, detectionMethod, detectionConfig, source } = body
    if (!botId || !name || !severity || !errorType || !stage || !detectionMethod || !detectionConfig) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    const id = generateId()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO error_patterns (id, bot_id, name, description, severity, error_type, stage, detection_method, detection_config, source, active, times_triggered, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)').run(id, botId, name, description || '', severity, errorType, stage, detectionMethod, JSON.stringify(detectionConfig), source || 'manual', now, now)
    const pattern = db.prepare('SELECT * FROM error_patterns WHERE id = ?').get(id)
    return NextResponse.json({ pattern }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
