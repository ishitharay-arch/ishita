import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';

/**
 * GET  /api/audit-entries?botId=...   list entries (all bots if botId omitted)
 * POST /api/audit-entries             { action: 'create' | 'promote' | 'delete', ... }
 *
 * This is the QC team's own record: what went wrong on a real call, typed in
 * as it is found. Remarks are evidence and stay free text.
 *
 * A remark cannot be graded against — it has no rule in it. A phrase can. So
 * an entry may carry a detect_phrase, and promoting the entry turns that
 * phrase into an error pattern, after which every graded call is checked for
 * it. That is the path from "someone noticed this" to "the platform catches
 * this automatically".
 */

export async function GET(request: NextRequest) {
  try {
    const botId = request.nextUrl.searchParams.get('botId');

    const bots = db.prepare(
      'SELECT id, name, department, use_case FROM bots ORDER BY name'
    ).all() as any[];

    const where = botId ? 'WHERE af.bot_id = ?' : '';
    const params = botId ? [botId] : [];

    const entries = db.prepare(`
      SELECT af.id, af.bot_id, af.interaction_id, af.auditor, af.verdict,
             af.error_label, af.severity, af.remarks, af.department,
             af.use_case, af.bot_name, af.detect_phrase, af.promoted_to,
             af.entered_via, af.audited_at, af.created_at,
             b.name AS bot_display,
             lr.passed AS grader_passed,
             lr.test_case_id
      FROM audit_feedback af
      JOIN bots b ON b.id = af.bot_id
      LEFT JOIN latest_results lr
        ON lr.interaction_id = af.interaction_id AND lr.bot_id = af.bot_id
      ${where}
      ORDER BY af.created_at DESC
      LIMIT 300
    `).all(...params) as any[];

    const counts = db.prepare(`
      SELECT bot_id, COUNT(*) AS n,
             SUM(CASE WHEN detect_phrase IS NOT NULL AND detect_phrase <> '' THEN 1 ELSE 0 END) AS with_phrase,
             SUM(CASE WHEN promoted_to IS NOT NULL THEN 1 ELSE 0 END) AS promoted
      FROM audit_feedback GROUP BY bot_id
    `).all() as any[];

    return NextResponse.json({ success: true, bots, entries, counts });
  } catch (error) {
    console.error('Error listing audit entries:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action || 'create';

    if (action === 'create') return createEntry(body);
    if (action === 'promote') return promoteEntry(body);
    if (action === 'delete')  return deleteEntry(body);

    return NextResponse.json(
      { success: false, error: `unknown action: ${action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in audit-entries:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

function createEntry(body: any) {
  const {
    botId, interactionId, department, useCase, remarks,
    detectPhrase, errorLabel, severity, verdict, auditor
  } = body;

  if (!botId) {
    return NextResponse.json(
      { success: false, error: 'Pick a voicebot.' },
      { status: 400 }
    );
  }
  if (!interactionId || !String(interactionId).trim()) {
    return NextResponse.json(
      { success: false, error: 'Interaction ID is required — it is what links this entry to a graded call.' },
      { status: 400 }
    );
  }
  if (!remarks || !String(remarks).trim()) {
    return NextResponse.json(
      { success: false, error: 'Remarks are required.' },
      { status: 400 }
    );
  }

  const bot = db.prepare('SELECT id, name, department, use_case FROM bots WHERE id = ?')
    .get(botId) as any;
  if (!bot) {
    return NextResponse.json(
      { success: false, error: `unknown botId: ${botId}` },
      { status: 404 }
    );
  }

  const id = String(interactionId).trim().toLowerCase();
  const who = (auditor || '').trim() || 'unknown';

  // Same call, same auditor, same bot updates in place rather than adding a
  // second row — so correcting an entry is just re-saving it.
  db.prepare(`
    INSERT INTO audit_feedback
      (id, bot_id, interaction_id, auditor, verdict, error_label, severity,
       remarks, department, use_case, bot_name, detect_phrase, entered_via,
       audited_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'form', datetime('now'))
    ON CONFLICT (bot_id, interaction_id, auditor) DO UPDATE SET
      verdict       = excluded.verdict,
      error_label   = excluded.error_label,
      severity      = excluded.severity,
      remarks       = excluded.remarks,
      department    = excluded.department,
      use_case      = excluded.use_case,
      detect_phrase = excluded.detect_phrase
  `).run(
    generateId(), bot.id, id, who,
    verdict || null,
    (errorLabel || '').trim() || null,
    (severity || '').trim() || null,
    String(remarks).trim(),
    (department || bot.department || '').trim() || null,
    (useCase || bot.use_case || '').trim() || null,
    bot.name,
    (detectPhrase || '').trim() || null
  );

  const graded = db.prepare(
    'SELECT passed FROM latest_results WHERE bot_id = ? AND interaction_id = ?'
  ).get(bot.id, id) as any;

  return NextResponse.json({
    success: true,
    saved: true,
    matchedGradedCall: !!graded,
    graderPassed: graded ? !!graded.passed : null
  });
}

/**
 * Turn an entry's detect_phrase into an error pattern.
 *
 * detection_config shape is copied from an existing keyword pattern so the
 * new row matches whatever lib/error-kb.ts already expects, rather than
 * guessing a schema and writing a pattern the grader silently ignores.
 */
function promoteEntry(body: any) {
  const { entryId } = body;
  if (!entryId) {
    return NextResponse.json(
      { success: false, error: 'entryId is required' },
      { status: 400 }
    );
  }

  const entry = db.prepare('SELECT * FROM audit_feedback WHERE id = ?')
    .get(entryId) as any;
  if (!entry) {
    return NextResponse.json(
      { success: false, error: 'entry not found' },
      { status: 404 }
    );
  }
  if (!entry.detect_phrase || !entry.detect_phrase.trim()) {
    return NextResponse.json({
      success: false,
      error: 'This entry has no detect phrase. Add the words the bot actually said, then promote it — a remark on its own cannot be graded against.'
    }, { status: 409 });
  }
  if (entry.promoted_to) {
    return NextResponse.json({
      success: false,
      error: 'This entry has already been promoted to a pattern.'
    }, { status: 409 });
  }

  const template = db.prepare(`
    SELECT detection_config FROM error_patterns
    WHERE detection_method = 'keyword' LIMIT 1
  `).get() as any;

  let config: string;
  if (template?.detection_config) {
    try {
      const parsed = JSON.parse(template.detection_config);
      // Replace whichever array field the existing config uses.
      const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (arrayKey) {
        config = JSON.stringify({ ...parsed, [arrayKey]: [entry.detect_phrase.trim()] });
      } else {
        config = JSON.stringify({ phrases: [entry.detect_phrase.trim()] });
      }
    } catch {
      config = JSON.stringify({ phrases: [entry.detect_phrase.trim()] });
    }
  } else {
    config = JSON.stringify({ phrases: [entry.detect_phrase.trim()] });
  }

  const name = (entry.error_label || '').trim() ||
    entry.detect_phrase.trim().split(/\s+/).slice(0, 4).join('_').toLowerCase();

  const patternId = generateId();

  try {
    db.transaction(() => {
      db.prepare(`
        INSERT INTO error_patterns
          (id, bot_id, name, description, severity, error_type, stage,
           detection_method, detection_config, source, active,
           times_triggered, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,'audit',1,0,datetime('now'),datetime('now'))
      `).run(
        patternId, entry.bot_id, name,
        entry.remarks || `Raised from audit of call ${entry.interaction_id}`,
        entry.severity || 'major',
        'repetition',
        'any',
        'keyword',
        config
      );
      db.prepare('UPDATE audit_feedback SET promoted_to = ? WHERE id = ?')
        .run(patternId, entry.id);
    })();
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: `Could not create the pattern: ${String(e)}. If a pattern with this name already exists for the bot, rename the error label first.`
    }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    patternId,
    name,
    message: `Pattern "${name}" is now active. Every call graded from here on is checked for this phrase.`
  });
}

function deleteEntry(body: any) {
  const { entryId } = body;
  if (!entryId) {
    return NextResponse.json(
      { success: false, error: 'entryId is required' },
      { status: 400 }
    );
  }
  const r = db.prepare('DELETE FROM audit_feedback WHERE id = ?').run(entryId);
  return NextResponse.json({ success: true, deleted: r.changes });
}