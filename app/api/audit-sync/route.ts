import { NextRequest, NextResponse } from 'next/server';
import db, { generateId } from '@/lib/db';

/**
 * GET  /api/audit-sync            -> list configured sources
 * POST /api/audit-sync            -> { sourceId, dryRun? } sync one source
 *
 * Pulls a published Google Sheet CSV and upserts rows into audit_feedback.
 * Re-syncing updates existing rows, so an edit in the sheet lands here on
 * the next sync instead of creating a duplicate.
 *
 * Nothing is inferred silently: the verdict derived from a free-text remark
 * is reported per row, and dryRun returns the parse without writing so the
 * mapping can be checked before anything is stored.
 */

type ColumnMap = {
  interaction_id: string;
  remarks?: string;
  verdict?: string;
  flow?: string;
  auditor?: string;
  audited_at?: string;
  error_label?: string;
  severity?: string;
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Remarks that mean "nothing wrong". Everything else is treated as a finding.
// Kept deliberately narrow: a remark we don't recognise becomes a fail, which
// errs toward flagging rather than toward a clean sheet.
const CLEAN_REMARKS = [
  'good call', 'good', 'no issue', 'no issues', 'ok', 'okay',
  'fine', 'nothing', 'na', 'n/a', '-', 'perfect', 'all good'
];

function deriveVerdict(remark: string): { verdict: 'pass' | 'fail'; derived: boolean } {
  const r = (remark || '').trim().toLowerCase().replace(/[.!]+$/, '');
  if (!r) return { verdict: 'pass', derived: true };
  if (CLEAN_REMARKS.includes(r)) return { verdict: 'pass', derived: true };
  return { verdict: 'fail', derived: true };
}

function normVerdict(raw: string): 'pass' | 'fail' | 'partial' | null {
  const v = (raw || '').trim().toLowerCase();
  if (['pass', 'passed', 'p', 'good', 'yes'].includes(v)) return 'pass';
  if (['fail', 'failed', 'f', 'bad', 'no'].includes(v)) return 'fail';
  if (['partial', 'part', 'partially'].includes(v)) return 'partial';
  return null;
}

/** Minimal RFC4180 parser: handles quoted fields, embedded commas, newlines. */
function parseCsv(text: string): string[][] {
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
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim() !== ''));
}

export async function GET() {
  const sources = db.prepare(`
    SELECT id, name, url, column_map, flow_map, default_auditor,
           last_synced_at, last_result, active
    FROM audit_sources ORDER BY name
  `).all() as any[];

  return NextResponse.json({
    success: true,
    sources: sources.map(s => ({
      ...s,
      column_map: JSON.parse(s.column_map),
      flow_map: JSON.parse(s.flow_map)
    }))
  });
}

export async function POST(request: NextRequest) {
  try {
    const { sourceId, dryRun } = await request.json();

    if (!sourceId) {
      return NextResponse.json(
        { success: false, error: 'sourceId is required' },
        { status: 400 }
      );
    }

    const source = db.prepare(
      'SELECT * FROM audit_sources WHERE id = ?'
    ).get(sourceId) as any;

    if (!source) {
      return NextResponse.json(
        { success: false, error: `unknown sourceId: ${sourceId}` },
        { status: 404 }
      );
    }
    if (!source.url) {
      return NextResponse.json({
        success: false,
        error: 'This source has no URL yet. In the sheet: File > Share > Publish to web, pick the tab, choose CSV, then paste the link here.'
      }, { status: 409 });
    }

    const cols: ColumnMap = JSON.parse(source.column_map);
    const flowMap: Record<string, string> = JSON.parse(source.flow_map);

    // --- fetch ---
    let csv: string;
    try {
      const res = await fetch(source.url, { cache: 'no-store' });
      if (!res.ok) {
        return NextResponse.json({
          success: false,
          error: `Sheet fetch returned ${res.status}. If it is 401 or 404, the tab is probably not published to the web.`
        }, { status: 502 });
      }
      csv = await res.text();
    } catch (e) {
      return NextResponse.json(
        { success: false, error: `Could not reach the sheet: ${String(e)}` },
        { status: 502 }
      );
    }

    if (csv.trimStart().startsWith('<')) {
      return NextResponse.json({
        success: false,
        error: 'The URL returned HTML, not CSV. Use the Publish to web link with CSV selected, not the normal sheet URL.'
      }, { status: 422 });
    }

    // --- parse ---
    const rows = parseCsv(csv);
    if (rows.length < 2) {
      return NextResponse.json(
        { success: false, error: 'The sheet has no data rows.' },
        { status: 422 }
      );
    }

    const header = rows[0].map(h => h.trim());
    const idx = (name?: string) =>
      name ? header.findIndex(h => h.toLowerCase() === name.toLowerCase()) : -1;

    const iId = idx(cols.interaction_id);
    if (iId === -1) {
      return NextResponse.json({
        success: false,
        error: `Column "${cols.interaction_id}" not found. The sheet has: ${header.join(', ')}`
      }, { status: 422 });
    }

    const iRemarks = idx(cols.remarks);
    const iVerdict = idx(cols.verdict);
    const iFlow = idx(cols.flow);
    const iAuditor = idx(cols.auditor);
    const iDate = idx(cols.audited_at);
    const iLabel = idx(cols.error_label);
    const iSeverity = idx(cols.severity);

    const knownBots = new Set(
      (db.prepare('SELECT id FROM bots').all() as any[]).map(b => b.id)
    );

    const prepared: any[] = [];
    const skipped: { row: number; reason: string; value?: string }[] = [];
    const unmappedFlows = new Map<string, number>();

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const rawId = (cells[iId] || '').trim();
      const m = rawId.match(UUID);

      if (!m) {
        skipped.push({ row: r + 1, reason: 'no interaction id', value: rawId.slice(0, 40) });
        continue;
      }

      const flow = iFlow >= 0 ? (cells[iFlow] || '').trim() : '';
      const botId = flowMap[flow];

      if (!botId) {
        unmappedFlows.set(flow || '(blank)', (unmappedFlows.get(flow || '(blank)') || 0) + 1);
        skipped.push({ row: r + 1, reason: 'flow not mapped to a bot', value: flow });
        continue;
      }
      if (!knownBots.has(botId)) {
        skipped.push({ row: r + 1, reason: `flow maps to unknown bot "${botId}"`, value: flow });
        continue;
      }

      const remarks = iRemarks >= 0 ? (cells[iRemarks] || '').trim() : '';
      const explicit = iVerdict >= 0 ? normVerdict(cells[iVerdict]) : null;
      const { verdict, derived } = explicit
        ? { verdict: explicit, derived: false }
        : deriveVerdict(remarks);

      prepared.push({
        id: generateId(),
        bot_id: botId,
        interaction_id: m[0].toLowerCase(),
        auditor: (iAuditor >= 0 ? (cells[iAuditor] || '').trim() : '') || source.default_auditor || 'unknown',
        verdict,
        verdict_derived: derived,
        error_label: iLabel >= 0 ? (cells[iLabel] || '').trim() || null : null,
        severity: iSeverity >= 0 ? (cells[iSeverity] || '').trim() || null : null,
        remarks: remarks || null,
        audited_at: iDate >= 0 ? (cells[iDate] || '').trim() || null : null,
        source_file: source.name
      });
    }

    // How many of these calls has the platform actually graded? Without an
    // overlap there is no agreement to measure, so report it up front.
    const gradedIds = new Set(
      (db.prepare('SELECT DISTINCT interaction_id FROM latest_results').all() as any[])
        .map(r => r.interaction_id)
    );
    const withGrading = prepared.filter(p => gradedIds.has(p.interaction_id)).length;

    const summary = {
      sheetRows: rows.length - 1,
      mapped: prepared.length,
      skipped: skipped.length,
      derivedVerdicts: prepared.filter(p => p.verdict_derived).length,
      matchedToGradedCalls: withGrading,
      unmappedFlows: Object.fromEntries(unmappedFlows),
      byBot: prepared.reduce((acc: Record<string, number>, p) => {
        acc[p.bot_id] = (acc[p.bot_id] || 0) + 1; return acc;
      }, {}),
      sampleSkipped: skipped.slice(0, 10)
    };

    if (dryRun) {
      return NextResponse.json({
        success: true, dryRun: true, summary,
        sample: prepared.slice(0, 5)
      });
    }

    // --- upsert ---
    // An edited remark in the sheet overwrites the stored row. Nothing is
    // ever duplicated, so syncing twice is harmless.
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
        const { verdict_derived, ...row } = p;
        upsert.run(row);
      }
      db.prepare(`
        UPDATE audit_sources
        SET last_synced_at = datetime('now'), last_result = ?
        WHERE id = ?
      `).run(JSON.stringify(summary), source.id);
    })();

    const total = db.prepare(
      'SELECT COUNT(*) n FROM audit_feedback'
    ).get() as { n: number };

    return NextResponse.json({
      success: true,
      summary,
      feedbackRowsTotal: total.n
    });
  } catch (error) {
    console.error('Error in audit-sync:', error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}