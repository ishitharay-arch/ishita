'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRight, CircleHelp, Loader2, ChevronDown, Brain,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot { id: string; name: string }

interface SoftScore { ruleName: string; score: number; reason: string }

interface Verdict {
  id: string
  result_id: string | null
  run_id: string | null
  test_case_id: string | null
  verdict: 'pass' | 'fail' | 'partial' | string
  detected_flow: string | null
  confidence: number | null
  failures: unknown[]
  summary: string | null
  remarks: string | null
  interaction_id: string | null
  soft_scores: SoftScore[]
  created_at: string
}

interface VerdictsResponse {
  success: boolean
  verdicts: Verdict[]
  counts: { pass: number; fail: number; partial: number; unknown: number }
  softAverages: Record<string, number>
}

const VERDICT_META: Record<string, { label: string; Icon: any; cls: string }> = {
  pass:    { label: 'Pass',    Icon: CheckCircle2,  cls: 'lv-pass' },
  fail:    { label: 'Fail',    Icon: XCircle,       cls: 'lv-fail' },
  partial: { label: 'Partial', Icon: AlertTriangle, cls: 'lv-partial' },
}

function ruleLabel(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// `failures` is free-form JSON written by whatever grading run produced it —
// plain strings from this app's own writers, but structured
// {rule, detail, severity} objects from at least one earlier import. Render
// either shape rather than crashing on the object case.
function failureText(f: unknown): string {
  if (typeof f === 'string') return f
  if (f && typeof f === 'object') {
    const o = f as Record<string, unknown>
    const rule = typeof o.rule === 'string' ? o.rule : null
    const detail = typeof o.detail === 'string' ? o.detail : null
    const severity = typeof o.severity === 'string' ? ` [${o.severity}]` : ''
    if (rule || detail) return `${rule ? rule + ': ' : ''}${detail || ''}${severity}`
  }
  return JSON.stringify(f)
}

export default function LlmVerdictsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [data, setData] = useState<VerdictsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchBots() {
      try {
        const res = await fetch('/api/grade-data')
        if (res.ok) {
          const j = await res.json()
          setBots(j.bots || [])
          if (j.bots?.length) setSelectedBotId(j.bots[0].id)
          else setLoading(false)
        } else setLoading(false)
      } catch (e) {
        console.error(e); setLoading(false)
      }
    }
    fetchBots()
  }, [])

  useEffect(() => {
    if (!selectedBotId) return
    loadVerdicts()
  }, [selectedBotId])

  async function loadVerdicts() {
    setLoading(true)
    try {
      const res = await fetch(`/api/llm-verdicts?botId=${encodeURIComponent(selectedBotId)}`)
      const j = await res.json()
      setData(res.ok && j.success ? j : null)
    } catch (e) {
      console.error(e); setData(null)
    } finally {
      setLoading(false)
    }
  }

  const verdicts = data?.verdicts || []
  const counts = data?.counts
  const softAverages = data?.softAverages || {}
  const total = verdicts.length

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>AI verdicts</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Brain size={14} /> LLM-assisted grading</div>
              <h1>AI verdicts</h1>
              <p>
                Claude&apos;s own read of each call — alongside the deterministic hard-rule grade
                on <a href="/grade" className="lv-link">Grade</a> and human ground truth on{' '}
                <a href="/audit-import" className="lv-link">Audit feedback</a>. Diagnostic only;
                it does not change the pass/fail gate.
              </p>
            </div>
            <div className="lv-picker">
              <select
                value={selectedBotId}
                onChange={e => setSelectedBotId(e.target.value)}
                aria-label="Bot"
              >
                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </div>

          {loading ? (
            <div className="lv-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : !bots.length ? (
            <div className="lv-empty">
              <p>No bots yet.</p>
              <small>Add a bot before grading transcripts.</small>
            </div>
          ) : !total ? (
            <div className="lv-empty">
              <p>No AI verdicts for this bot yet.</p>
              <small>Grade some transcripts to see Claude&apos;s verdicts here.</small>
              <div className="lv-empty-actions">
                <a href="/bulk-grade" className="ghost-button">Grade transcripts</a>
              </div>
            </div>
          ) : (
            <>
              <div className="lv-summary">
                <div className="lv-stat">
                  <span className="lv-stat-num">{total}</span>
                  <span className="lv-stat-label">Calls graded</span>
                </div>
                <div className="lv-stat lv-stat-pass">
                  <span className="lv-stat-num">{counts?.pass ?? 0}</span>
                  <span className="lv-stat-label">Pass</span>
                </div>
                <div className="lv-stat lv-stat-partial">
                  <span className="lv-stat-num">{counts?.partial ?? 0}</span>
                  <span className="lv-stat-label">Partial</span>
                </div>
                <div className="lv-stat lv-stat-fail">
                  <span className="lv-stat-num">{counts?.fail ?? 0}</span>
                  <span className="lv-stat-label">Fail</span>
                </div>
              </div>

              {Object.keys(softAverages).length > 0 && (
                <div className="lv-section">
                  <div className="lv-section-head"><h2>Average soft-rule scores</h2></div>
                  <div className="lv-score-grid">
                    {Object.entries(softAverages).map(([name, avg]) => (
                      <div className="lv-score-card" key={name}>
                        <div className="lv-score-top">
                          <span>{ruleLabel(name)}</span>
                          <span className="lv-score-num">{avg.toFixed(2)}</span>
                        </div>
                        <div className="lv-score-bar">
                          <div className="lv-score-fill" style={{ width: `${(avg / 5) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="lv-section">
                <div className="lv-section-head">
                  <h2>Per-call verdicts</h2>
                  <span className="lv-count">{total}</span>
                </div>
                <div className="lv-rows">
                  {verdicts.map(v => {
                    const meta = VERDICT_META[v.verdict] || { label: v.verdict, Icon: AlertTriangle, cls: 'lv-partial' }
                    const Icon = meta.Icon
                    return (
                      <div className={`lv-row ${meta.cls}`} key={v.id}>
                        <div className="lv-row-top">
                          <span className={`lv-verdict ${meta.cls}`}><Icon size={12} /> {meta.label}</span>
                          {v.detected_flow && <span className="lv-tc">{v.detected_flow}</span>}
                          {v.confidence !== null && (
                            <span className="lv-confidence">confidence {(v.confidence * 100).toFixed(0)}%</span>
                          )}
                          {v.interaction_id && <span className="lv-id">{v.interaction_id.slice(0, 8)}</span>}
                        </div>

                        {v.summary && <p className="lv-summary-text">{v.summary}</p>}

                        {v.failures.length > 0 && (
                          <ul className="lv-failures">
                            {v.failures.map((f, i) => <li key={i}>{failureText(f)}</li>)}
                          </ul>
                        )}

                        {v.remarks && <p className="lv-remark">{v.remarks}</p>}

                        {v.soft_scores.length > 0 && (
                          <div className="lv-chips">
                            {v.soft_scores.map((s, i) => (
                              <span
                                className={`lv-chip ${s.score <= 2 ? 'lv-chip-low' : s.score >= 4 ? 'lv-chip-high' : ''}`}
                                key={i}
                                title={s.reason}
                              >
                                {ruleLabel(s.ruleName)}: {s.score}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="lv-row-meta">
                          <span>{new Date(v.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  )
}

const styles = `
:root { --ink: #F8FAFC; --muted-ink: #94A3B8; --line: #334155; --surface: #1E293B; --wash: #0F172A; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--wash); color: var(--ink); font-family: var(--geist), Arial, sans-serif; }
button, select, textarea, input { font: inherit; }
button { cursor: pointer; }
a { text-decoration: none; }
.app-shell { min-height: 100vh; display: flex; background: var(--wash); }
.sidebar { width: 228px; flex: 0 0 228px; background: var(--surface); border-right: 1px solid var(--line); padding: 25px 14px 17px; display: flex; flex-direction: column; min-height: 100vh; }
.brand { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 750; letter-spacing: -0.04em; padding: 0 12px 28px; color: #F8FAFC; }
.brand-mark { display: grid; place-items: center; width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 9px; }
.brand-dot { color: #c89b59; }
.workspace-label, .nav-section { color: #94A3B8; text-transform: uppercase; letter-spacing: .1em; font-size: 9px; font-weight: 700; padding: 0 12px 8px; }
.workspace-select { display: flex; align-items: center; gap: 8px; border: 0; background: transparent; color: #F8FAFC; width: 100%; padding: 7px 10px 21px; text-align: left; }
.workspace-select svg { margin-left: auto; color: #94A3B8; }
.workspace-icon { display: grid; place-items: center; width: 25px; height: 25px; background: #d9eee9; color: #21685d; border-radius: 7px; font-weight: 800; font-size: 12px; }
.workspace-name { font-weight: 650; font-size: 12px; }
.nav-list { display: flex; flex-direction: column; gap: 3px; }
.nav-section.second { margin-top: 23px; }
.nav-item { display: flex; gap: 11px; align-items: center; color: #94A3B8; font-size: 12px; font-weight: 590; border-radius: 8px; padding: 10px 12px; }
.nav-item:hover { background: #334155; color: #F8FAFC; }
.nav-item.active { background: #334155; color: #F8FAFC; font-weight: 700; }
.sidebar-bottom { margin-top: auto; }
.help-card { display: flex; gap: 9px; align-items: center; margin: 0 4px 18px; border: 1px solid #334155; background: #1E293B; padding: 10px; border-radius: 9px; color: #94A3B8; }
.help-card strong { font-size: 11px; display: block; color: #F8FAFC; }
.help-card p { font-size: 10px; margin: 3px 0 0; }
.help-icon { width: 25px; height: 25px; display: grid; place-items: center; color: #367d85; background: #e2f2ee; border-radius: 7px; }
.help-card > svg { margin-left: auto; }
.profile { display: flex; align-items: center; gap: 9px; border-top: 1px solid #334155; padding-top: 18px; }
.avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.profile-text { flex: 1; }
.profile-text strong { font-size: 11px; display: block; color: #F8FAFC; }
.profile-text span { font-size: 10px; color: #94A3B8; }
.main-content { flex: 1; display: flex; flex-direction: column; background: #0F172A; min-width: 0; }
.topbar { background: #1E293B; border-bottom: 1px solid #334155; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94A3B8; }
.breadcrumb strong { color: #F8FAFC; }
.top-actions { display: flex; align-items: center; gap: 12px; }
.icon-button { background: transparent; border: none; color: #94A3B8; padding: 7px; border-radius: 7px; }
.icon-button:hover { background: #334155; color: #F8FAFC; }
.top-avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.page-wrap { padding: 30px 32px 40px; flex: 1; min-width: 0; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #94A3B8; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #F8FAFC; }
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; max-width: 700px; line-height: 1.6; }
.ghost-button { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.lv-link { color: #F59E0B; text-decoration: underline; text-underline-offset: 3px; }
.lv-link:hover { color: #FBBF24; }
.lv-picker { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; }
.lv-picker select { appearance: none; background: #1E293B; color: #E2E8F0; border: 1px solid #334155; border-radius: 8px; padding: 11px 36px 11px 14px; font-size: 13px; font-family: inherit; cursor: pointer; min-height: 44px; }
.lv-picker select:hover { border-color: #475569; }
.lv-picker svg { position: absolute; right: 12px; pointer-events: none; color: #94A3B8; }
.lv-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px 0; color: #94A3B8; font-size: 14px; }
.lv-empty { text-align: center; padding: 60px 20px; color: #64748B; }
.lv-empty p { margin: 0 0 6px; font-size: 14px; }
.lv-empty small { font-size: 12px; display: block; margin-bottom: 16px; }
.lv-empty-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }

.lv-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
.lv-stat { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 18px; text-align: center; }
.lv-stat-num { display: block; font-size: 26px; font-weight: 700; color: #F8FAFC; }
.lv-stat-label { font-size: 11px; color: #94A3B8; }
.lv-stat-pass .lv-stat-num { color: #4ADE80; }
.lv-stat-partial .lv-stat-num { color: #FBBF24; }
.lv-stat-fail .lv-stat-num { color: #F87171; }

.lv-section { margin-bottom: 28px; }
.lv-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.lv-section-head h2 { margin: 0; font-size: 15px; font-weight: 700; color: #F8FAFC; }
.lv-count { background: #334155; color: #E2E8F0; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }

.lv-score-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.lv-score-card { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 14px; }
.lv-score-top { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; color: #E2E8F0; margin-bottom: 8px; }
.lv-score-num { font-size: 16px; font-weight: 700; color: #F8FAFC; }
.lv-score-bar { height: 6px; background: #334155; border-radius: 999px; overflow: hidden; }
.lv-score-fill { height: 100%; background: linear-gradient(90deg, #F87171, #FBBF24, #4ADE80); border-radius: 999px; }

.lv-rows { display: flex; flex-direction: column; gap: 10px; }
.lv-row { background: #1E293B; border: 1px solid #334155; border-left: 3px solid #475569; border-radius: 10px; padding: 14px 16px; }
.lv-row.lv-pass { border-left-color: #4ADE80; }
.lv-row.lv-fail { border-left-color: #F87171; }
.lv-row.lv-partial { border-left-color: #FBBF24; }
.lv-row-top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.lv-verdict { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; text-transform: uppercase; letter-spacing: .03em; }
.lv-verdict.lv-pass { color: #4ADE80; background: #4ADE8022; }
.lv-verdict.lv-fail { color: #F87171; background: #F8717122; }
.lv-verdict.lv-partial { color: #FBBF24; background: #FBBF2422; }
.lv-tc { font-size: 11px; color: #94A3B8; background: #0F172A; border: 1px solid #334155; padding: 2px 8px; border-radius: 6px; }
.lv-confidence { font-size: 11px; color: #64748B; }
.lv-id { font-family: monospace; font-size: 11px; color: #64748B; margin-left: auto; }
.lv-summary-text { margin: 0 0 8px; font-size: 13px; color: #E2E8F0; line-height: 1.5; }
.lv-failures { margin: 0 0 8px; padding-left: 18px; }
.lv-failures li { font-size: 12.5px; color: #FCA5A5; line-height: 1.6; }
.lv-remark { margin: 0 0 8px; font-size: 12px; color: #94A3B8; font-style: italic; line-height: 1.5; }
.lv-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.lv-chip { font-size: 11px; color: #CBD5E1; background: #0F172A; border: 1px solid #334155; padding: 3px 8px; border-radius: 999px; }
.lv-chip-low { color: #FCA5A5; border-color: #F8717155; }
.lv-chip-high { color: #86EFAC; border-color: #4ADE8055; }
.lv-row-meta { font-size: 11px; color: #64748B; }

@media (max-width: 900px) {
  .lv-summary { grid-template-columns: repeat(2, 1fr); }
}
`

if (typeof document !== 'undefined' && !document.getElementById('llm-verdicts-styles')) {
  const style = document.createElement('style')
  style.id = 'llm-verdicts-styles'
  style.textContent = styles
  document.head.appendChild(style)
}
