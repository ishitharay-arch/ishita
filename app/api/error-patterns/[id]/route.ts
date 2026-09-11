import { NextRequest, NextResponse } from 'next/server'
import db from '@/lib/db'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const pattern = db.prepare('SELECT * FROM error_patterns WHERE id = ?').get(id)
    if (!pattern) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ pattern })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, severity, errorType, stage, detectionMethod, detectionConfig, active } = body
    const existing = db.prepare('SELECT * FROM error_patterns WHERE id = ?').get(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const now = new Date().toISOString()
    db.prepare('UPDATE error_patterns SET name=COALESCE(?,name), description=COALESCE(?,description), severity=COALESCE(?,severity), error_type=COALESCE(?,error_type), stage=COALESCE(?,stage), detection_method=COALESCE(?,detection_method), detection_config=COALESCE(?,detection_config), active=COALESCE(?,active), updated_at=? WHERE id=?').run(name||null, description||null, severity||null, errorType||null, stage||null, detectionMethod||null, detectionConfig?JSON.stringify(detectionConfig):null, active!==undefined?(active?1:0):null, now, id)
    const updated = db.prepare('SELECT * FROM error_patterns WHERE id = ?').get(id)
    return NextResponse.json({ pattern: updated })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = db.prepare('SELECT * FROM error_patterns WHERE id = ?').get(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    db.prepare('DELETE FROM error_patterns WHERE id = ?').run(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
