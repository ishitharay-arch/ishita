import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';

/**
 * POST /api/audit-import
 *
 * multipart/form-data:
 *   file      - the audit export (.csv or .tsv)
 *   botId     - optional. When set, every row is filed under this bot and the
 *               flow column is ignored. Use it for a single-bot sheet.
 *   flowMap   - optional JSON. { "CS_inclinic": "aishwarya", ... }
 *               Used when one sheet covers several bots.
 *   columnMap - optional JSON overriding header detection.
 *   dryRun    - "true" to parse and report without writing.
 *
 * The sheet stays private: nothing is published, nothing is fetched. You
 * export, upload, and the same row is updated rather than duplicated on the
 * next upload — so editing a remark and re-uploading changes the stored
 * feedback.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Exotel call identifiers come in more than one shape depending on the export.
// Accept a UUID anywhere in the cell, or a bare alphanumeric SID of the kind
// Exotel uses for CallSid, rather than forcing one format on the sheet.
const SID = /^[a-z0-9]{15,64}$/i;

/** Header names we recognise for each field, first match wins. */
const HEADER_ALIASES: Record<string, string[]> = {
  interaction_id: [
    'interactionid', 'interaction id', 'interaction_id',
    'callsid', 'call sid', 'call_sid', 'sid',
    'callid', 'call id', 'call_id',
    'conversationid', 'conversation id',
    'uuid', 'call uuid', 'interaction'
  ],
  verdict: ['verdict', 'result', 'pass/fail', 'passfail', 'status', 'outcome', 'qc verdict'],
  remarks: ['remarks', 'remark', 'comments', 'comment', 'notes', 'observation', 'observations', 'feedback'],
  flow: ['flow name', 'flowname', 'flow', 'bot', 'bot name', 'botname', 'use case', 'usecase'],
  auditor: ['auditor', 'audited by', 'reviewer', 'team', 'qc by', 'name'],
  audited_at: ['date', 'audited at', 'audit date', 'call date', 'timestamp'],
  error_label: ['error label', 'error', 'error type', 'issue', 'issue type', 'category', 'pattern'],
  severity: ['severity', 'priority', 'impact']
};

const CLEAN_REMARKS = [
  'good call', 'good', 'no issue', 'no issues', 'ok', 'okay',
  'fine', 'nothing', 'na', 'n/a', '-', 'perfect', 'all good', 'no remarks'
];

function normVerdict(raw: string): 'pass' | 'fail' | 'partial' | null {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return null;
  if (['pass', 'passed', 'p', 'good', 'yes', 'y', 'ok', 'success'].includes(v)) return 'pass';
  if (['fail', 'failed', 'f', 'bad', 'no', 'n'].includes(v)) return 'fail';
  if (['partial', 'part', 'partially', 'partial pass'].includes(v)) return 'partial';
  return null;
}

function deriveVerdict(remark: string): 'pass' | 'fail' {
  const r = (remark || '').trim().toLowerCase().replace(/[.!,]+$/, '');
  if (!r) return 'pass';
  return CLEAN_REMARKS.includes(r) ? 'pass' : 'fail';
}

function looksLikeId(cell: string): string | null {
  const raw = (cell || '').trim();
  if (!raw) return null;
  const m = raw.match(UUID);
  if (m) return m[0].toLowerCase();
  if (SID.test(raw)) return raw.toLowerCase();
  return null;
}

/** RFC4180-ish parser. Handles quotes, embedded commas and newlines. */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

function detectColumns(header: string[]): Record<string, number> {
  const norm = header.map(h => h.trim().toLowerCase());
  const found: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const i = norm.findIndex(h => aliases.includes(h));
    if (i >= 0) found[field] = i;
  }
  return found;
}

/**
 * If no header matched an id alias, find the column whose cells actually look
 * like call identifiers. A sheet with an unhelpful header still imports.
 */
function guessIdColumn(rows: string[][]): number {
  const sample = rows.slice(1, 25);
  let best = -1, bestHits = 0;
  const width = Math.max(...rows.map(r => r.length));
  for (let c = 0; c < width; c++) {
    const hits = sample.filter(r => looksLikeId(r[c] || '')).length;
    if (hits > bestHits) { bestHits = hits; best = c; }
  }
  return bestHits >= Math.max(2, sample.length * 0.5) ? best : -1;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const botIdParam = (form.get('botId') as string) || '';
    const dryRun = String(form.get('dryRun') || '') === 'true';
    const auditorParam = (form.get('auditor') as string) || '';

    let flowMap: Record<string, string> = {};
    let columnOverride: Record<string, number> = {};
    try {
      const fm = form.get('flowMap') as string;
      if (fm) flowMap = JSON.parse(fm);
      const cm = form.get('columnMap') as string;
      if (cm) columnOverride = JSON.parse(cm);
    } catch {
      return NextResponse.json(
        { success: false, error: 'flowMap or columnMap is not valid JSON.' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded. Export the audit tab as CSV and upload it.' },
        { status: 400 }
      );
    }

    const bots = db.prepare('SELECT id, name FROM bots').all() as { id: string; name: string }[];
    const knownBots = new Set(bots.map(b => b.id));

    if (botIdParam && !knownBots.has(botIdParam)) {
      return NextResponse.json(
        { success: false, error: `unknown botId: ${botIdParam}` },
        { status: 404 }
      );
    }
    if (!botIdParam && Object.keys(flowMap).length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Pick a bot, or supply a flowMap so each row can be assigned to one. Rows are never filed under a guessed bot.'
      }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return NextResponse.json({
        success: false,
        error: 'Excel files are not read directly. In Sheets use File > Download > CSV, or in Excel use Save As > CSV.'
      }, { status: 415 });
    }

    const text = await file.text();
    const delim = name.endsWith('.tsv') || (text.split('\n')[0] || '').includes('\t') ? '\t' : ',';
    const rows = parseDelimited(text, delim);

    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, error: 'That file has a header but no data rows.' },
        { status: 422 }
      );
    }

    const header = rows[0];
    const cols = { ...detectColumns(header), ...columnOverride };

    if (cols.interaction_id === undefined) {
      const guessed = guessIdColumn(rows);
      if (guessed >= 0) cols.interaction_id = guessed;
    }

    if (cols.interaction_id === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Could not find a call id column. Name it InteractionID or CallSid, or pass columnMap.',
        headersSeen: header
      }, { status: 422 });
    }

    const cell = (r: string[], field: string) =>
      cols[field] === undefined ? '' : (r[cols[field]] || '').trim();

    const prepared: any[] = [];
    const skipped: { row: number; reason: string; value?: string }[] = [];
    const unmappedFlows = new Map<string, number>();
    let derivedCount = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const id = looksLikeId(cell(row, 'interaction_id'));

      if (!id) {
        skipped.push({
          row: r + 1,
          reason: 'no usable call id',
          value: cell(row, 'interaction_id').slice(0, 40)
        });
        continue;
      }

      let botId = botIdParam;
      if (!botId) {
        const flow = cell(row, 'flow');
        botId = flowMap[flow];
        if (!botId) {
          const key = flow || '(blank)';
          unmappedFlows.set(key, (unmappedFlows.get(key) || 0) + 1);
          skipped.push({ row: r + 1, reason: 'flow not mapped to a bot', value: flow });
          continue;
        }
        if (!knownBots.has(botId)) {
          skipped.push({ row: r + 1, reason: `flow maps to unknown bot "${botId}"`, value: flow });
          continue;
        }
      }

      const remarks = cell(row, 'remarks');
      const explicit = normVerdict(cell(row, 'verdict'));
      const verdict = explicit ?? deriveVerdict(remarks);
      if (!explicit) derivedCount++;

      prepared.push({
        id: generateId(),
        bot_id: botId,
        interaction_id: id,
        auditor: cell(row, 'auditor') || auditorParam || 'unknown',
        verdict,
        error_label: cell(row, 'error_label') || null,
        severity: cell(row, 'severity') || null,
        remarks: remarks || null,
        audited_at: cell(row, 'audited_at') || null,
        source_file: file.name,
        _derived: !explicit
      });
    }

    // Without overlap there is no agreement to measure, so say so up front
    // rather than letting an empty matrix look like a bug later.
    const gradedIds = new Set(
      (db.prepare('SELECT DISTINCT interaction_id FROM latest_results').all() as any[])
        .map(x => x.interaction_id)
    );
    const matched = prepared.filter(p => gradedIds.has(p.interaction_id));

    const summary = {
      fileName: file.name,
      dataRows: rows.length - 1,
      mapped: prepared.length,
      skipped: skipped.length,
      verdictsDerivedFromRemarks: derivedCount,
      matchedToGradedCalls: matched.length,
      notYetGraded: prepared.length - matched.length,
      byBot: prepared.reduce((acc: Record<string, number>, p) => {
        acc[p.bot_id] = (acc[p.bot_id] || 0) + 1; return acc;
      }, {}),
      byVerdict: prepared.reduce((acc: Record<string, number>, p) => {
        acc[p.verdict] = (acc[p.verdict] || 0) + 1; return acc;
      }, {}),
      unmappedFlows: Object.fromEntries(unmappedFlows),
      columnsUsed: Object.fromEntries(
        Object.entries(cols).map(([k, i]) => [k, header[i] ?? `col ${i}`])
      ),
      sampleSkipped: skipped.slice(0, 10)
    };

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        summary,
        sample: prepared.slice(0, 5).map(({ _derived, ...p }) => ({ ...p, verdictDerived: _derived }))
      });
    }

    // Same call, same auditor, same bot updates in place. Re-uploading an
    // edited sheet changes the stored feedback instead of duplicating it.
    const upsert = db.prepare(`
      INSERT INTO audit_feedback
        (id, bot_id, interaction_id, auditor, verdict, error_label,
         severity, remarks, source_file, audited_at)
      VALUES (@id, @bot_id, @interaction_id, @auditor, @verdict, @error_label,
              @severity, @remarks, @source_file, @audited_at)
      ON CONFLICT (bot_id, interaction_id, auditor) DO UPDATE SET
        verdict     = excluded.verdict,
        error_label = excluded.error_label,
        severity    = excluded.severity,
        remarks     = excluded.remarks,
        source_file = excluded.source_file,
        audited_at  = excluded.audited_at
    `);

    db.transaction(() => {
      for (const p of prepared) {
        const { _derived, ...row } = p;
        upsert.run(row);
      }
    })();

    const total = db.prepare('SELECT COUNT(*) n FROM audit_feedback').get() as { n: number };

    return NextResponse.json({
      success: true,
      summary,
      feedbackRowsTotal: total.n
    });
  } catch (error) {
    console.error('Error in audit-import:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}