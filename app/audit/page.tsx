'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRight, CircleHelp, Loader2, AlertTriangle, CheckCircle2,
  XCircle, ClipboardCheck, Users, ChevronDown, Bug, Info, Brain
} from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot { id: string; name: string }

interface Matrix {
  agree_pass: number
  agree_fail: number
  false_pass: number
  false_fail: number
  ungraded: number
}

interface Agreement {
  bot: Bot
  matrix: Matrix
  compared: number
  agreed: number
  agreementRate: number | null
  feedbackRows: number
  gradedCalls: number
  falsePasses: any[]
  falseFails: any[]
  noisyRules: { rule: string; n: number }[]
  uncoveredLabels: { error_label: string; n: number }[]
  humanDisagreements: any[]
  threeWay: any[]
  threeWayStats: {
    total: number
    det_agrees_human: number
    claude_agrees_human: number
    all_agree: number
    claude_catches_det_misses: number
  }
}

export default function AuditPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [data, setData] = useState<Agreement | null>(null)
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
    loadAgreement()
  }, [selectedBotId])

  async function loadAgreement() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agreement?botId=${encodeURIComponent(selectedBotId)}`)
      const j = await res.json()
      setData(res.ok && j.success ? j : null)
    } catch (e) {
      console.error(e); setData(null)
    } finally {
      setLoading(false)
    }
  }

  const m = data?.matrix
  const rate = data?.agreementRate

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Audit agreement</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><ClipboardCheck size={14} /> Human ground truth</div>
              <h1>Audit agreement</h1>
              <p>
                Verdicts logged in <a href="/audit-import" className="au-link">Audit feedback</a> are
                compared against the grader&apos;s results. The disagreements are the useful part:
                a call an auditor failed that the grader passed is a rule the platform is missing.
              </p>
            </div>
            <div className="au-picker">
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
            <div className="au-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : !data ? (
            <div className="au-empty">
              <ClipboardCheck size={30} style={{ opacity: .3, marginBottom: 10 }} />
              <p>No agreement data for this bot yet.</p>
            </div>
          ) : data.feedbackRows === 0 && data.gradedCalls === 0 ? (
            <div className="au-empty">
              <ClipboardCheck size={30} style={{ opacity: .3, marginBottom: 10 }} />
              <p>No audit feedback or graded calls for {data.bot.name} yet.</p>
              <div className="au-empty-actions">
                <a href="/audit-import" className="ghost-button">Log audit feedback</a>
                <a href="/bulk-grade" className="ghost-button">Grade transcripts</a>
              </div>
            </div>
          ) : data.feedbackRows === 0 ? (
            <div className="au-empty">
              <ClipboardCheck size={30} style={{ opacity: .3, marginBottom: 10 }} />
              <p>No audit feedback for {data.bot.name} yet.</p>
              <small>{data.gradedCalls} call{data.gradedCalls !== 1 ? 's' : ''} graded and waiting to be compared.</small>
              <div className="au-empty-actions">
                <a href="/audit-import" className="ghost-button">Log audit feedback</a>
              </div>
            </div>
          ) : data.gradedCalls === 0 ? (
            <div className="au-empty">
              <ClipboardCheck size={30} style={{ opacity: .3, marginBottom: 10 }} />
              <p>{data.feedbackRows} audit row{data.feedbackRows !== 1 ? 's' : ''} logged for {data.bot.name}, but no calls graded yet.</p>
              <div className="au-empty-actions">
                <a href="/bulk-grade" className="ghost-button">Grade transcripts</a>
              </div>
            </div>
          ) : (
            <>
              {/* Headline */}
              <div className="au-headline">
                <div className="au-rate">
                  <span className="au-rate-num">{rate === null ? '—' : `${rate?.toFixed(1)}%`}</span>
                  <span className="au-rate-label">
                    grader agrees with {data.bot.name}&apos;s auditors
                  </span>
                  <small>{data.agreed} of {data.compared} calls compared</small>
                </div>
                <div className="au-matrix" role="table" aria-label="Agreement matrix">
                  <div className="au-mcell au-mhead" />
                  <div className="au-mcell au-mhead">Auditor: pass</div>
                  <div className="au-mcell au-mhead">Auditor: flagged</div>

                  <div className="au-mcell au-mhead">Grader: pass</div>
                  <div className="au-mcell au-agree">{m?.agree_pass ?? 0}<small>agree</small></div>
                  <div className="au-mcell au-bad">{m?.false_pass ?? 0}<small>missed</small></div>

                  <div className="au-mcell au-mhead">Grader: fail</div>
                  <div className="au-mcell au-warncell">{m?.false_fail ?? 0}<small>over-flagged</small></div>
                  <div className="au-mcell au-agree">{m?.agree_fail ?? 0}<small>agree</small></div>
                </div>
              </div>

              {m && m.ungraded > 0 && (
                <div className="au-inline-warn">
                  <Info size={14} />
                  <span>{m.ungraded} audited call{m.ungraded !== 1 ? 's are' : ' is'} not graded yet and {m.ungraded !== 1 ? 'are' : 'is'} excluded from the rate above.</span>
                </div>
              )}

              {/* Missed by the grader */}
              <div className="au-section">
                <div className="au-section-head">
                  <h2>Missed by the grader</h2>
                  <span className="au-count au-count-bad">{data.falsePasses.length}</span>
                </div>
                <p className="au-section-sub">
                  An auditor flagged these and the grader passed them. Each one is a candidate
                  error pattern — the label says which.
                </p>
                {data.falsePasses.length === 0 ? (
                  <div className="au-none">Nothing missed. Every call an auditor flagged, the grader also failed.</div>
                ) : (
                  <div className="au-rows">
                    {data.falsePasses.map((r, i) => (
                      <div className="au-row au-row-bad" key={i}>
                        <div className="au-row-top">
                          <span className="au-verdict au-fail"><XCircle size={12} /> auditor: {r.human_verdict}</span>
                          {r.error_label && <span className="au-label"><Bug size={11} /> {r.error_label}</span>}
                          {r.severity && <span className={`au-sev au-sev-${r.severity}`}>{r.severity}</span>}
                          <span className="au-tc">{r.test_case_id}</span>
                        </div>
                        {r.remarks && <p className="au-remark">{r.remarks}</p>}
                        <div className="au-row-meta">
                          <span>{r.auditor}</span>
                          <span className="au-id">{r.interaction_id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Over-flagged */}
              <div className="au-section">
                <div className="au-section-head">
                  <h2>Over-flagged by the grader</h2>
                  <span className="au-count au-count-warn">{data.falseFails.length}</span>
                </div>
                <p className="au-section-sub">
                  The grader failed these; the auditor was happy with them. Rules worth loosening.
                </p>
                {data.noisyRules.length > 0 && (
                  <div className="au-noisy">
                    {data.noisyRules.map((n, i) => (
                      <span key={i} className="au-noisy-item">{n.rule} <b>{n.n}</b></span>
                    ))}
                  </div>
                )}
                {data.falseFails.length === 0 ? (
                  <div className="au-none">No over-flagging. Nothing the grader failed was passed by an auditor.</div>
                ) : (
                  <div className="au-rows">
                    {data.falseFails.map((r, i) => (
                      <div className="au-row au-row-warn" key={i}>
                        <div className="au-row-top">
                          <span className="au-verdict au-pass"><CheckCircle2 size={12} /> auditor: pass</span>
                          <span className="au-tc">{r.test_case_id}</span>
                        </div>
                        {r.remarks && <p className="au-remark">{r.remarks}</p>}
                        <div className="au-row-meta">
                          <span>{r.auditor}</span>
                          <span className="au-id">{r.interaction_id}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Coverage gap */}
              {data.uncoveredLabels.length > 0 && (
                <div className="au-section">
                  <div className="au-section-head">
                    <h2>Error labels with no pattern</h2>
                    <span className="au-count">{data.uncoveredLabels.length}</span>
                  </div>
                  <p className="au-section-sub">
                    Your auditors use these labels and the Error KB has no matching pattern.
                    This is the gap between what people catch and what the platform checks.
                  </p>
                  <div className="au-chips">
                    {data.uncoveredLabels.map((l, i) => (
                      <a className="au-chip" key={i} href="/error-kb">
                        {l.error_label} <b>{l.n}</b>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Auditor disagreement */}
              {data.humanDisagreements.length > 0 && (
                <div className="au-section">
                  <div className="au-section-head">
                    <h2><Users size={16} /> Auditors disagree with each other</h2>
                    <span className="au-count">{data.humanDisagreements.length}</span>
                  </div>
                  <p className="au-section-sub">
                    Two people reached different verdicts on the same call. This is the ceiling
                    on what any grader can reach — it cannot be more consistent than the humans
                    it is measured against.
                  </p>
                  <div className="au-rows">
                    {data.humanDisagreements.map((r, i) => (
                      <div className="au-row" key={i}>
                        <div className="au-row-top"><span className="au-tc">{r.detail}</span></div>
                        <div className="au-row-meta"><span className="au-id">{r.interaction_id}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Three-way comparison: Deterministic vs Human vs Claude */}
              {data.threeWay && data.threeWay.length > 0 && (
                <div className="au-section au-three-way">
                  <div className="au-section-head">
                    <h2><Brain size={16} /> Three-way comparison</h2>
                    <span className="au-count" style={{background:'#7C3AED25',color:'#A78BFA'}}>{data.threeWayStats.total}</span>
                  </div>
                  <p className="au-section-sub">
                    Calls where all three verdicts exist — deterministic grader, human auditor, and Claude.
                    This shows whether LLM grading is closer to the auditors than the deterministic rules.
                  </p>

                  <div className="tw-stats">
                    <div className="tw-stat">
                      <div className="tw-stat-val">{data.threeWayStats.total > 0 ? `${((data.threeWayStats.det_agrees_human / data.threeWayStats.total) * 100).toFixed(0)}%` : '—'}</div>
                      <div className="tw-stat-label">Deterministic agrees with auditor</div>
                    </div>
                    <div className="tw-stat tw-stat-accent">
                      <div className="tw-stat-val">{data.threeWayStats.total > 0 ? `${((data.threeWayStats.claude_agrees_human / data.threeWayStats.total) * 100).toFixed(0)}%` : '—'}</div>
                      <div className="tw-stat-label">Claude agrees with auditor</div>
                    </div>
                    <div className="tw-stat">
                      <div className="tw-stat-val">{data.threeWayStats.claude_catches_det_misses}</div>
                      <div className="tw-stat-label">Claude caught what deterministic missed</div>
                    </div>
                    <div className="tw-stat">
                      <div className="tw-stat-val">{data.threeWayStats.all_agree}</div>
                      <div className="tw-stat-label">All three agree</div>
                    </div>
                  </div>

                  <div className="tw-table-wrap">
                    <table className="tw-table">
                      <thead>
                        <tr>
                          <th>Call</th>
                          <th>Auditor</th>
                          <th>Deterministic</th>
                          <th>Claude</th>
                          <th>Claude summary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.threeWay.map((row: any, i: number) => {
                          const humanFailed = row.human_verdict === 'fail' || row.human_verdict === 'failed';
                          const detPassed = row.det_cell === 'false_pass' || row.det_cell === 'agree_pass';
                          const claudeFailed = row.claude_verdict === 'fail';

                          return (
                            <tr key={i}>
                              <td className="tw-id">{row.interaction_id?.slice(0, 12)}...</td>
                              <td><span className={humanFailed ? 'tw-fail' : 'tw-pass'}>{humanFailed ? 'FAIL' : 'PASS'}</span></td>
                              <td><span className={detPassed ? 'tw-pass' : 'tw-fail'}>{detPassed ? 'PASS' : 'FAIL'}</span></td>
                              <td><span className={claudeFailed ? 'tw-fail' : 'tw-pass'}>{claudeFailed ? 'FAIL' : 'PASS'}</span></td>
                              <td className="tw-summary">{row.claude_summary || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
.primary-button { background: #F59E0B; color: #0F172A; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; min-height: 44px; }
.primary-button:disabled { opacity: .5; cursor: not-allowed; }
.ghost-button { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; min-height: 44px; display: inline-flex; align-items: center; }
.au-picker { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; }
.au-picker select { appearance: none; background: #1E293B; color: #E2E8F0; border: 1px solid #334155; border-radius: 8px; padding: 11px 36px 11px 14px; font-size: 13px; font-family: inherit; cursor: pointer; min-height: 44px; }
.au-picker select:hover { border-color: #475569; }
.au-picker svg { position: absolute; right: 12px; pointer-events: none; color: #94A3B8; }
.au-link { color: #F59E0B; text-decoration: underline; text-underline-offset: 3px; }
.au-link:hover { color: #FBBF24; }
.au-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px 0; color: #94A3B8; font-size: 14px; }
.au-empty { text-align: center; padding: 60px 20px; color: #64748B; }
.au-empty p { margin: 0 0 6px; font-size: 14px; }
.au-empty small { font-size: 12px; display: block; margin-bottom: 16px; }
.au-empty-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
.au-inline-warn { display: flex; align-items: flex-start; gap: 9px; background: #F59E0B10; border: 1px solid #F59E0B44; border-radius: 8px; padding: 10px 13px; margin-bottom: 12px; font-size: 12px; color: #FBBF24; line-height: 1.55; }
.au-inline-warn svg { flex: 0 0 auto; margin-top: 1px; }
.au-headline { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: 20px; align-items: stretch; margin-bottom: 14px; }
.au-rate { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; justify-content: center; }
.au-rate-num { font-size: 44px; font-weight: 700; letter-spacing: -0.03em; color: #F8FAFC; line-height: 1; }
.au-rate-label { font-size: 13px; color: #E2E8F0; margin-top: 10px; line-height: 1.5; }
.au-rate small { font-size: 12px; color: #64748B; margin-top: 8px; }
.au-matrix { display: grid; grid-template-columns: 130px 1fr 1fr; gap: 1px; background: #334155; border: 1px solid #334155; border-radius: 12px; overflow: hidden; }
.au-mcell { background: #1E293B; padding: 16px 14px; font-size: 22px; font-weight: 700; color: #F8FAFC; display: flex; flex-direction: column; justify-content: center; }
.au-mcell small { font-size: 11px; font-weight: 500; color: #94A3B8; margin-top: 4px; }
.au-mhead { font-size: 11px; font-weight: 650; color: #94A3B8; background: #172033; }
.au-agree { color: #4ADE80; }
.au-bad { color: #F87171; background: #EF44440E; }
.au-warncell { color: #FBBF24; background: #F59E0B0E; }
.au-section { margin-top: 26px; }
.au-section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.au-section-head h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; font-weight: 650; color: #F8FAFC; }
.au-count { font-size: 11px; font-weight: 700; background: #334155; color: #CBD5E1; border-radius: 9px; padding: 2px 9px; }
.au-count-bad { background: #EF444425; color: #F87171; }
.au-count-warn { background: #F59E0B25; color: #FBBF24; }
.au-section-sub { margin: 0 0 14px; font-size: 13px; color: #94A3B8; line-height: 1.6; max-width: 700px; }
.au-none { font-size: 13px; color: #64748B; background: #1E293B; border: 1px solid #253449; border-radius: 9px; padding: 14px 16px; }
.au-rows { display: flex; flex-direction: column; gap: 9px; }
.au-row { background: #1E293B; border: 1px solid #334155; border-left: 3px solid #334155; border-radius: 9px; padding: 13px 15px; }
.au-row-bad { border-left-color: #EF4444; }
.au-row-warn { border-left-color: #F59E0B; }
.au-row-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.au-verdict { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; }
.au-fail { color: #F87171; }
.au-pass { color: #4ADE80; }
.au-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-family: monospace; background: #334155; color: #CBD5E1; border-radius: 4px; padding: 2px 7px; }
.au-sev { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px; }
.au-sev-critical { background: #EF444425; color: #F87171; }
.au-sev-major { background: #F59E0B25; color: #FBBF24; }
.au-sev-minor { background: #334155; color: #94A3B8; }
.au-tc { font-size: 11px; font-family: monospace; color: #94A3B8; }
.au-remark { margin: 9px 0 0; font-size: 13px; color: #E2E8F0; line-height: 1.55; }
.au-row-meta { display: flex; gap: 14px; margin-top: 9px; font-size: 11px; color: #64748B; flex-wrap: wrap; }
.au-id { font-family: monospace; }
.au-noisy { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.au-noisy-item { font-size: 11px; font-family: monospace; background: #F59E0B14; border: 1px solid #F59E0B44; color: #FBBF24; border-radius: 6px; padding: 4px 9px; }
.au-chips { display: flex; gap: 9px; flex-wrap: wrap; }
.au-chip { display: inline-flex; align-items: center; gap: 7px; min-height: 44px; padding: 0 14px; background: #1E293B; border: 1px solid #EF444455; border-radius: 9px; color: #F87171; font-size: 12px; font-family: monospace; text-decoration: none; }
.au-chip:hover { border-color: #EF4444; background: #EF44440E; }
.au-chip b { color: #F8FAFC; }
/* Three-way comparison */
.au-three-way { border-top: 1px solid #7C3AED33; padding-top: 24px; margin-top: 32px; }
.tw-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
.tw-stat { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; text-align: center; }
.tw-stat-accent { border-color: #7C3AED55; background: #7C3AED0A; }
.tw-stat-val { font-size: 24px; font-weight: 700; color: #F8FAFC; }
.tw-stat-accent .tw-stat-val { color: #A78BFA; }
.tw-stat-label { font-size: 11px; color: #94A3B8; margin-top: 4px; line-height: 1.4; }
.tw-table-wrap { overflow-x: auto; }
.tw-table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #334155; border-radius: 10px; overflow: hidden; }
.tw-table th { background: #172033; color: #94A3B8; font-size: 11px; font-weight: 650; padding: 10px 14px; text-align: left; }
.tw-table td { background: #1E293B; color: #E2E8F0; font-size: 13px; padding: 10px 14px; border-top: 1px solid #334155; }
.tw-id { font-family: monospace; color: #64748B; font-size: 11px; }
.tw-pass { color: #4ADE80; font-weight: 700; font-size: 12px; }
.tw-fail { color: #F87171; font-weight: 700; font-size: 12px; }
.tw-summary { color: #94A3B8; font-size: 12px; max-width: 300px; line-height: 1.5; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .au-headline { grid-template-columns: 1fr; }
  .au-matrix { grid-template-columns: 100px 1fr 1fr; }
}
`

if (typeof document !== 'undefined' && !document.getElementById('audit-styles')) {
  const style = document.createElement('style')
  style.id = 'audit-styles'
  style.textContent = styles
  document.head.appendChild(style)
}