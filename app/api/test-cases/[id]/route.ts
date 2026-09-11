import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * PUT /api/test-cases/[id]
 * Body: { spec: {...} }  — replaces the whole spec.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = db.prepare('SELECT id, spec FROM test_cases WHERE id = ?').get(id) as
      | { id: string; spec: string }
      | undefined;

    if (!existing) {
      return NextResponse.json({ success: false, error: `Test case ${id} not found` }, { status: 404 });
    }

    if (!body.spec || !body.spec.scenario_type) {
      return NextResponse.json(
        { success: false, error: 'A scenario_type is required.' },
        { status: 400 }
      );
    }

    db.prepare('UPDATE test_cases SET spec = ? WHERE id = ?').run(JSON.stringify(body.spec), id);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error updating test case:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/test-cases/[id]
 *
 * Note: results rows reference test_case_id. Deleting a test case leaves
 * historical results pointing at an id that no longer exists — they are kept
 * rather than cascaded, so past runs stay auditable.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = db.prepare('SELECT id FROM test_cases WHERE id = ?').get(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: `Test case ${id} not found` }, { status: 404 });
    }

    const usedIn = db
      .prepare('SELECT COUNT(*) AS n FROM results WHERE test_case_id = ?')
      .get(id) as { n: number };

    db.prepare('DELETE FROM test_cases WHERE id = ?').run(id);

    return NextResponse.json({ success: true, id, orphanedResults: usedIn.n });
  } catch (error) {
    console.error('Error deleting test case:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}
