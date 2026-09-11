'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRight, CircleHelp, Loader2, AlertTriangle, ChevronDown, Bug,
  ListChecks, Shield, Target, Zap, EyeOff, TriangleAlert, Info
} from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot { id: string; name: string }

interface Health {
  testCases: number
  unruled: number
  inflating: number
  undetectable: number
  patterns: number
  activePatterns: number
  neverTriggered: number
  noisy: number
  uncoveredLabels: number
}

interface Pattern {
  id: string
  name: string
  description: string
  severity: string
  error_type: string
  stage: string
  detection_method: string
  active: boolean
  times_triggered: number
  phrases: string[]
  noiseCount: number
  neverTriggered: boolean
  fromAudit: boolean
}

interface TestCase {
  id: string
  scenario: string | null
  priority: string | null
  description: string | null
  mustSay: string[]
  mustNotSay: string[]
  tools: string[]
  expectTerminal: boolean
  ruleCount: number
  calls: number
  passed: number
  passRate: number | null
  unruled: boolean
  inflating: boolean
  neverMatched: boolean
  undetectable: boolean
  flowRules: number
}

export default function RulesPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [botId, setBotId] = useState('')
  const [health, setHealth] = useState<Health | null>(null)
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [uncovered, setUncovered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)

  useEffect(() => {
    async function fetchBots() {
      try {
        const res = await fetch('/api/grade-data')
        const j = await res.json()
        setBots(j.bots || [])
        if (j.bots?.length) setBotId(j.bots[0].id)
        else setLoading(false)
      } catch (e) { console.error(e); setLoading(false) }
    }
    fetchBots()
  }, [])

  useEffect(() => {
    if (!botId) return
    load()
  }, [botId])

  async function load() {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/rules?botId=${encodeURIComponent(botId)}`)
      const j = await res.json()
      if (!j.success) { setError(j.error); setHealth(null); return }
      setHealth(j.health)
      setPatterns(j.patterns || [])
      setTestCases(j.testCases || [])
      setUncovered(j.uncoveredLabels || [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const shownPatterns = onlyProblems
    ? patterns.filter(p => p.noiseCount > 0 || (p.neverTriggered && p.active) || !p.active)
    : patterns

  const shownCases = onlyProblems
    ? testCases.filter(t => t.unruled || t.undetectable)
    : testCases

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Grading rules</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Shield size={14} /> What the grader checks</div>
              <h1>Grading rules</h1>
              <p>
                Everything a call is checked against. Universal rules apply to every call.
                Scenario rules apply only when that flow is detected, so they are only as
                reliable as detection is.
              </p>
            </div>
            <div className="rl-picker">
              <select value={botId} onChange={e => setBotId(e.target.value)} aria-label="Bot">
                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <ChevronDown size={14} />
            </div>
          </div>

          {error && <div className="rl-error"><AlertTriangle size={15} /> {error}</div>}

          {loading ? (
            <div className="rl-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : !health ? (
            <div className="rl-empty"><p>No rules found for this bot.</p></div>
          ) : (
            <>
              {/* Health */}
              <div className="rl-health">
                <div className="rl-hcard">
                  <span>{health.activePatterns}</span>
                  <small>universal rules active</small>
                </div>
                <div className="rl-hcard">
                  <span>{health.testCases}</span>
                  <small>scenario rules</small>
                </div>
                <div className={`rl-hcard ${health.unruled ? 'bad' : ''}`}>
                  <span>{health.unruled}</span>
                  <small>scenarios with no checks</small>
                </div>
                <div className={`rl-hcard ${health.inflating ? 'bad' : ''}`}>
                  <span>{health.inflating}</span>
                  <small>inflating the pass rate</small>
                </div>
                <div className={`rl-hcard ${health.noisy ? 'warn' : ''}`}>
                  <span>{health.noisy}</span>
                  <small>rules the auditors disagreed with</small>
                </div>
                <div className={`rl-hcard ${health.uncoveredLabels ? 'warn' : ''}`}>
                  <span>{health.uncoveredLabels}</span>
                  <small>audit labels with no rule</small>
                </div>
              </div>

              {health.inflating > 0 && (
                <div className="rl-callout rl-bad">
                  <TriangleAlert size={15} />
                  <span>
                    {health.inflating} scenario rule{health.inflating !== 1 ? 's have' : ' has'} matched
                    real calls while checking nothing. Those calls passed without being tested,
                    so the pass rate is higher than the bot deserves. This is the first thing worth fixing.
                  </span>
                </div>
              )}

              {uncovered.length > 0 && (
                <div className="rl-callout rl-warn">
                  <Info size={15} />
                  <span>
                    Your audit team uses {uncovered.length} label{uncovered.length !== 1 ? 's' : ''} the
                    grader has no rule for: {uncovered.map(u => u.error_label).join(', ')}.
                    Log one on the Audit Import page with a detect phrase and promote it to close the gap.
                  </span>
                </div>
              )}

              <div className="rl-toggle">
                <label>
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={e => setOnlyProblems(e.target.checked)}
                  />
                  Show only rules that need attention
                </label>
              </div>

              {/* Universal */}
              <div className="rl-section">
                <div className="rl-shead">
                  <h2><Shield size={17} /> Universal rules</h2>
                  <span className="rl-count">{shownPatterns.length}</span>
                </div>
                <p className="rl-ssub">
                  Checked on every call regardless of what the caller wanted. These do not
                  depend on flow detection, which makes them the more reliable half of grading.
                </p>

                {shownPatterns.length === 0 ? (
                  <div className="rl-none">Nothing here.</div>
                ) : (
                  <div className="rl-rows">
                    {shownPatterns.map(p => (
                      <div className={`rl-row ${!p.active ? 'rl-off' : ''}`} key={p.id}>
                        <div className="rl-row-main">
                          <div className="rl-row-top">
                            <strong>{p.name}</strong>
                            <span className={`rl-sev rl-sev-${p.severity}`}>{p.severity}</span>
                            <span className="rl-tag">{p.error_type}</span>
                            <span className="rl-tag">{p.stage}</span>
                            <span className="rl-tag">{p.detection_method}</span>
                            {p.fromAudit && <span className="rl-audit"><Zap size={10} /> from audit</span>}
                            {!p.active && <span className="rl-inactive"><EyeOff size={10} /> off</span>}
                          </div>
                          {p.description && <p className="rl-desc">{p.description}</p>}
                          {p.phrases.length > 0 && (
                            <div className="rl-phrases">
                              {p.phrases.slice(0, 4).map((ph, i) => <code key={i}>{ph}</code>)}
                              {p.phrases.length > 4 && <span className="rl-more">+{p.phrases.length - 4}</span>}
                            </div>
                          )}
                          <div className="rl-row-meta">
                            <span>fired {p.times_triggered}x</span>
                            {p.neverTriggered && p.active && (
                              <span className="rl-flag-warn">never fired — may be dead</span>
                            )}
                            {p.noiseCount > 0 && (
                              <span className="rl-flag-bad">
                                fired on {p.noiseCount} call{p.noiseCount !== 1 ? 's' : ''} the auditors passed
                              </span>
                            )}
                          </div>
                        </div>
                        <a className="rl-edit" href="/error-kb">Edit</a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scenario */}
              <div className="rl-section">
                <div className="rl-shead">
                  <h2><Target size={17} /> Scenario rules</h2>
                  <span className="rl-count">{shownCases.length}</span>
                </div>
                <p className="rl-ssub">
                  Checked only on calls detected as that scenario. A scenario with no checks
                  passes every call matched to it, and one with no flow rule can never be
                  detected at all.
                </p>

                {shownCases.length === 0 ? (
                  <div className="rl-none">Nothing here.</div>
                ) : (
                  <div className="rl-rows">
                    {shownCases.map(t => (
                      <div
                        className={`rl-row ${t.inflating ? 'rl-row-bad' : t.unruled ? 'rl-row-warn' : ''}`}
                        key={t.id}
                      >
                        <div className="rl-row-main">
                          <div className="rl-row-top">
                            <strong>{t.id}</strong>
                            {t.scenario && <span className="rl-tag">{t.scenario}</span>}
                            {t.priority && <span className="rl-tag">{t.priority}</span>}
                            {t.unruled && <span className="rl-nocheck"><TriangleAlert size={10} /> no checks</span>}
                            {t.undetectable && <span className="rl-inactive"><EyeOff size={10} /> no flow rule</span>}
                          </div>
                          {t.description && <p className="rl-desc">{t.description}</p>}

                          {t.ruleCount > 0 && (
                            <div className="rl-checks">
                              {t.mustSay.length > 0 && (
                                <div><span className="rl-clabel">must say</span>
                                  {t.mustSay.map((s, i) => <code key={i}>{s}</code>)}</div>
                              )}
                              {t.mustNotSay.length > 0 && (
                                <div><span className="rl-clabel rl-cneg">must not say</span>
                                  {t.mustNotSay.map((s, i) => <code key={i}>{s}</code>)}</div>
                              )}
                              {t.tools.length > 0 && (
                                <div><span className="rl-clabel">tools</span>
                                  {t.tools.map((s, i) => <code key={i}>{s}</code>)}</div>
                              )}
                            </div>
                          )}

                          <div className="rl-row-meta">
                            <span>{t.ruleCount} check{t.ruleCount !== 1 ? 's' : ''}</span>
                            <span>{t.calls} call{t.calls !== 1 ? 's' : ''} matched</span>
                            {t.passRate !== null && <span>{t.passRate.toFixed(0)}% passed</span>}
                            {t.inflating && (
                              <span className="rl-flag-bad">
                                {t.calls} call{t.calls !== 1 ? 's' : ''} passed here without being checked
                              </span>
                            )}
                            {t.neverMatched && !t.unruled && (
                              <span className="rl-flag-warn">never matched a call</span>
                            )}
                          </div>
                        </div>
                        <a className="rl-edit" href="/test-cases">Edit</a>
                      </div>
                    ))}
                  </div>
                )}
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
.primary-button { background: #F59E0B; color: #0F172A; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; min-height: 44px; }
.primary-button:disabled { opacity: .5; cursor: not-allowed; }
.ghost-button { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; min-height: 44px; }
.rl-picker { position: relative; display: inline-flex; align-items: center; flex-shrink: 0; }
.rl-picker select { appearance: none; background: #1E293B; color: #E2E8F0; border: 1px solid #334155; border-radius: 8px; padding: 11px 36px 11px 14px; font-size: 13px; font-family: inherit; cursor: pointer; min-height: 44px; }
.rl-picker svg { position: absolute; right: 12px; pointer-events: none; color: #94A3B8; }
.rl-error { display: flex; align-items: center; gap: 9px; padding: 12px 14px; margin-bottom: 16px; background: #EF444414; border: 1px solid #EF444455; border-radius: 9px; color: #F87171; font-size: 13px; }
.rl-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px 0; color: #94A3B8; font-size: 14px; }
.rl-empty { text-align: center; padding: 60px 20px; color: #64748B; }
.rl-health { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px; }
.rl-hcard { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 15px; }
.rl-hcard span { display: block; font-size: 26px; font-weight: 700; color: #F8FAFC; line-height: 1.1; }
.rl-hcard small { display: block; margin-top: 6px; font-size: 11px; color: #94A3B8; line-height: 1.45; }
.rl-hcard.bad { border-color: #EF444455; background: #EF44440C; }
.rl-hcard.bad span { color: #F87171; }
.rl-hcard.warn { border-color: #F59E0B55; background: #F59E0B0C; }
.rl-hcard.warn span { color: #FBBF24; }
.rl-callout { display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; margin-bottom: 12px; border-radius: 9px; font-size: 13px; line-height: 1.6; }
.rl-callout svg { flex: 0 0 auto; margin-top: 2px; }
.rl-bad { background: #EF444412; border: 1px solid #EF444455; color: #FCA5A5; }
.rl-warn { background: #F59E0B12; border: 1px solid #F59E0B55; color: #FBBF24; }
.rl-toggle { margin: 18px 0 22px; }
.rl-toggle label { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; color: #94A3B8; cursor: pointer; min-height: 44px; }
.rl-toggle input { width: 16px; height: 16px; accent-color: #F59E0B; cursor: pointer; }
.rl-section { margin-bottom: 32px; }
.rl-shead { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.rl-shead h2 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 17px; font-weight: 650; color: #F8FAFC; }
.rl-count { font-size: 11px; font-weight: 700; background: #334155; color: #CBD5E1; border-radius: 9px; padding: 2px 9px; }
.rl-ssub { margin: 0 0 16px; font-size: 13px; color: #94A3B8; line-height: 1.6; max-width: 720px; }
.rl-none { font-size: 13px; color: #64748B; background: #1E293B; border: 1px solid #253449; border-radius: 9px; padding: 14px 16px; }
.rl-rows { display: flex; flex-direction: column; gap: 9px; }
.rl-row { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; background: #1E293B; border: 1px solid #334155; border-left: 3px solid #334155; border-radius: 9px; padding: 14px 15px; }
.rl-row-bad { border-left-color: #EF4444; }
.rl-row-warn { border-left-color: #F59E0B; }
.rl-off { opacity: .55; }
.rl-row-main { flex: 1; min-width: 0; }
.rl-row-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rl-row-top strong { font-size: 14px; color: #F8FAFC; }
.rl-sev { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px; }
.rl-sev-critical { background: #EF444425; color: #F87171; }
.rl-sev-major { background: #F59E0B25; color: #FBBF24; }
.rl-sev-minor { background: #334155; color: #94A3B8; }
.rl-tag { font-size: 10px; font-family: monospace; background: #334155; color: #CBD5E1; border-radius: 4px; padding: 2px 7px; }
.rl-audit { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; background: #22C55E20; color: #4ADE80; border-radius: 4px; padding: 2px 7px; }
.rl-inactive { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 650; background: #334155; color: #94A3B8; border-radius: 4px; padding: 2px 7px; }
.rl-nocheck { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; background: #EF444425; color: #F87171; border-radius: 4px; padding: 2px 7px; }
.rl-desc { margin: 9px 0 0; font-size: 13px; color: #CBD5E1; line-height: 1.55; }
.rl-phrases, .rl-checks { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
.rl-phrases { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 6px; }
.rl-checks > div { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.rl-clabel { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #4ADE80; flex: 0 0 auto; }
.rl-cneg { color: #F87171; }
.rl-row code, .rl-phrases code { font-family: monospace; font-size: 11px; background: #0F172A; border: 1px solid #253449; color: #E2E8F0; border-radius: 5px; padding: 3px 8px; }
.rl-more { font-size: 11px; color: #64748B; }
.rl-row-meta { display: flex; gap: 14px; margin-top: 10px; font-size: 11px; color: #64748B; flex-wrap: wrap; }
.rl-flag-bad { color: #F87171; font-weight: 650; }
.rl-flag-warn { color: #FBBF24; font-weight: 650; }
.rl-edit { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-height: 44px; padding: 0 15px; background: #334155; border: 1px solid #475569; border-radius: 8px; color: #F8FAFC; font-size: 12px; font-weight: 600; }
.rl-edit:hover { border-color: #F59E0B; color: #F59E0B; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 820px) { .rl-row { flex-direction: column; } }
`

if (typeof document !== 'undefined' && !document.getElementById('rules-styles')) {
  const style = document.createElement('style')
  style.id = 'rules-styles'
  style.textContent = styles
  document.head.appendChild(style)
}