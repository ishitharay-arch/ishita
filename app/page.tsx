'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ArrowRight, Search, CircleHelp, MoreHorizontal, AudioLines, LayoutDashboard, FlaskConical, ClipboardCheck, Sparkles, MessageSquareText, Headphones, Settings2, Users, Bug, ListChecks, Activity, Gauge, FileText, Loader2, AlertTriangle, TrendingUp, CheckCircle2, XCircle, Bot as BotIcon, Settings } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

type Bot = { id: string; name: string }

type Stats = {
  botId: string
  botName: string | null
  testCasesCount: number
  activePatternsCount: number
  resultsCount: number
  unruledCount: number
  unruledIds: string[]
  livePromptStats: {
    version: number
    total: number
    passed: number
    passRate: number | null
  } | null
  recentWindow: {
    count: number
    passed: number
    failed: number
    passRate: number
    gradedAt: string | null
  } | null
  recentWindowSize: number
  topFailures: { reason: string; count: number }[]
  activePrompt: { version: number; createdAt: string } | null
}

export default function OverviewPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // Bot list loads once. /api/grade-data returns it unscoped.
  useEffect(() => {
    async function fetchBots() {
      try {
        const res = await fetch('/api/grade-data')
        if (res.ok) {
          const data = await res.json()
          setBots(data.bots || [])
          if (data.bots?.length > 0) setSelectedBotId(data.bots[0].id)
          else setLoading(false)
        } else {
          setLoading(false)
        }
      } catch (e) {
        console.error('Error fetching bots:', e)
        setLoading(false)
      }
    }
    fetchBots()
  }, [])

  // Stats are always scoped to one bot. Every number on this page belongs
  // to the bot named in the first card, and to no other.
  useEffect(() => {
    if (!selectedBotId) return
    let cancelled = false
    async function fetchStats() {
      setLoading(true)
      try {
        const res = await fetch(`/api/stats?botId=${encodeURIComponent(selectedBotId)}`)
        const data = await res.json()
        if (cancelled) return
        if (res.ok && data.success) setStats(data.stats)
        else setStats(null)
      } catch (e) {
        console.error('Error fetching stats:', e)
        if (!cancelled) setStats(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchStats()
    return () => { cancelled = true }
  }, [selectedBotId])

  function fmtDate(s: string | null) {
    if (!s) return '—'
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : d.toLocaleString()
  }

  // All-time rate on the live prompt version — the figure that means
  // something across the whole history, unlike a rolling window.
  const passRate = stats?.livePromptStats?.passRate ?? undefined

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Overview</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Search"><Search size={17} /></button>
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Activity size={14} /> Evaluation workspace</div>
              <h1>Medibuddy QC</h1>
              <p>
                Grades voice bot call transcripts against scenario test cases and error patterns.
                All checks are deterministic — phrase matching and counting, no model judgement.
              </p>
            </div>
            <div className="page-heading-actions">
              {bots.length > 1 && (
                <label className="ov-bot-picker">
                  <select
                    value={selectedBotId}
                    onChange={(e) => setSelectedBotId(e.target.value)}
                    aria-label="Bot"
                  >
                    {bots.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
              )}
              <a className="primary-button" href="/bulk-grade"><Sparkles size={15} /> Bulk grade transcripts</a>
            </div>
          </div>

          {loading ? (
            <div className="ov-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : !stats ? (
            <div className="ov-loading">Couldn&apos;t load stats. Is the dev server running?</div>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat-card">
                  <div className="stat-icon blue"><BotIcon size={17} /></div>
                  <div className="stat-top"><span>Bot under test</span></div>
                  <strong>{stats.botName || 'None'}</strong>
                  <small>{stats.activePrompt ? `Prompt v${stats.activePrompt.version}` : 'No prompt version recorded'}</small>
                </div>

                <div className="stat-card">
                  <div className="stat-icon purple"><ListChecks size={17} /></div>
                  <div className="stat-top"><span>Test cases</span></div>
                  <strong>{stats.testCasesCount}</strong>
                  <small>{stats.activePatternsCount} active error pattern{stats.activePatternsCount !== 1 ? 's' : ''}</small>
                </div>

                <div className="stat-card">
                  <div className="stat-icon green"><Gauge size={17} /></div>
                  <div className="stat-top"><span>Pass rate</span></div>
                  <strong>{passRate !== undefined ? `${passRate.toFixed(1)}%` : '—'}</strong>
                  <small>
                    {stats.livePromptStats && stats.livePromptStats.total > 0
                      ? `v${stats.livePromptStats.version} · ${stats.livePromptStats.total} graded call${stats.livePromptStats.total !== 1 ? 's' : ''}`
                      : 'Nothing graded yet'}
                  </small>
                </div>

                <div className="stat-card">
                  <div className="stat-icon orange"><FileText size={17} /></div>
                  <div className="stat-top"><span>Graded results</span></div>
                  <strong>{stats.resultsCount}</strong>
                  <small>All time, including re-runs</small>
                </div>
              </div>

              {stats.unruledCount > 0 && (
                <div className="ov-warn">
                  <AlertTriangle size={15} />
                  <span>
                    {stats.unruledCount} test case{stats.unruledCount !== 1 ? 's have' : ' has'} no gradeable rules.
                    Calls matched to {stats.unruledCount !== 1 ? 'them' : 'it'} pass without being checked against anything.
                    {' '}<a href="/test-cases">Review test cases</a>
                  </span>
                </div>
              )}

              <div className="ov-grid">
                <section className="ov-panel">
                  <div className="ov-panel-head">
                    <div>
                      <h2>Recent calls</h2>
                      <p>
                        {stats.recentWindow
                          ? `${stats.recentWindow.count} calls · ${fmtDate(stats.recentWindow.gradedAt)}`
                          : 'No calls graded yet'}
                      </p>
                    </div>
                    <a className="text-button" href="/transcripts">Open transcripts <ArrowRight size={14} /></a>
                  </div>

                  {stats.recentWindow ? (
                    <>
                      <div className="ov-split">
                        <div className="ov-split-item">
                          <CheckCircle2 size={16} style={{ color: '#22C55E' }} />
                          <strong>{stats.recentWindow.passed}</strong>
                          <span>passed</span>
                        </div>
                        <div className="ov-split-item">
                          <XCircle size={16} style={{ color: '#EF4444' }} />
                          <strong>{stats.recentWindow.failed}</strong>
                          <span>flagged</span>
                        </div>
                      </div>
                      <div className="ov-bar">
                        <div
                          className="ov-bar-fill"
                          style={{ width: `${(stats.recentWindow.passed / stats.recentWindow.count) * 100}%` }}
                        />
                      </div>
                      <p className="ov-note">
                        A flagged call tripped at least one rule. Whether that is a bot defect or a
                        rule that needs tuning is a judgement call — open the transcript and read it.
                      </p>
                    </>
                  ) : (
                    <div className="ov-empty">
                      <p>Upload transcripts on the Bulk Grade page to get started.</p>
                    </div>
                  )}
                </section>

                <aside className="ov-panel">
                  <div className="ov-panel-head">
                    <div>
                      <h2>Top failure patterns</h2>
                      <p>Across the latest graded calls</p>
                    </div>
                    <TrendingUp size={17} className="muted-icon" />
                  </div>

                  {stats.topFailures.length === 0 ? (
                    <div className="ov-empty"><p>No failures recorded.</p></div>
                  ) : (
                    <div className="ov-fail-list">
                      {stats.topFailures.map((f, i) => (
                        <div className="ov-fail" key={i}>
                          <span className="ov-fail-rank">{i + 1}</span>
                          <span className="ov-fail-reason">{f.reason}</span>
                          <span className="ov-fail-count">{f.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <a className="text-button" href="/error-kb">Manage error patterns <ArrowRight size={14} /></a>
                </aside>
              </div>

              <div className="section-heading">
                <div><h2>Where to go</h2><p>What each part of the platform does.</p></div>
              </div>

              <div className="ov-links">
                <a className="ov-link" href="/bulk-grade">
                  <Sparkles size={18} />
                  <strong>Bulk Grade</strong>
                  <span>Upload a batch of transcripts and grade them all at once.</span>
                </a>
                <a className="ov-link" href="/grade">
                  <ClipboardCheck size={18} />
                  <strong>Grade</strong>
                  <span>Grade a single call and see exactly which rules fired.</span>
                </a>
                <a className="ov-link" href="/transcripts">
                  <Headphones size={18} />
                  <strong>Transcripts</strong>
                  <span>Read any graded call turn by turn, filtered by verdict or failure.</span>
                </a>
                <a className="ov-link" href="/test-cases">
                  <ListChecks size={18} />
                  <strong>Test Cases</strong>
                  <span>The scenarios calls are matched to, and the rules each one checks.</span>
                </a>
                <a className="ov-link" href="/error-kb">
                  <Bug size={18} />
                  <strong>Error KB</strong>
                  <span>Patterns checked on every call, plus suggestions from transcripts.</span>
                </a>
                <a className="ov-link" href="/setup">
                  <Settings size={18} />
                  <strong>Model Config</strong>
                  <span>Configure Claude and other AI models for test generation and grading.</span>
                </a>
                <div className="ov-link ov-link-disabled">
                  <MessageSquareText size={18} />
                  <strong>Prompt Library</strong>
                  <span>Not built yet.</span>
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
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 26px; flex-wrap: wrap; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #94A3B8; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 30px; font-weight: 750; color: #F8FAFC; letter-spacing: -0.02em; }
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; max-width: 640px; line-height: 1.6; }
.primary-button { background: #F59E0B; color: #0F172A; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.text-button { background: transparent; border: none; color: #F59E0B; font-size: 12px; font-weight: 650; display: inline-flex; align-items: center; gap: 6px; padding: 0; }
.muted-icon { color: #64748B; }
.ov-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 70px 0; color: #94A3B8; font-size: 14px; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); gap: 15px; margin-bottom: 20px; }
.stat-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 4px; }
.stat-icon { width: 36px; height: 36px; display: grid; place-items: center; border-radius: 9px; margin-bottom: 8px; }
.stat-icon.blue { background: #3b82f6; color: #fff; }
.stat-icon.purple { background: #8b5cf6; color: #fff; }
.stat-icon.green { background: #22c55e; color: #fff; }
.stat-icon.orange { background: #f59e0b; color: #fff; }
.stat-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stat-top span { font-size: 12px; color: #94A3B8; }
.stat-card strong { font-size: 23px; font-weight: 700; color: #F8FAFC; letter-spacing: -0.01em; }
.stat-card small { font-size: 11px; color: #64748B; }
.page-heading-actions { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.ov-bot-picker { position: relative; display: inline-flex; align-items: center; }
.ov-bot-picker select { appearance: none; background: #1E293B; color: #E2E8F0; border: 1px solid #334155; border-radius: 8px; padding: 9px 34px 9px 13px; font-size: 13px; font-family: inherit; cursor: pointer; }
.ov-bot-picker select:hover { border-color: #475569; }
.ov-bot-picker svg { position: absolute; right: 11px; pointer-events: none; color: #94A3B8; }
.ov-warn { display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; margin-bottom: 24px; background: #F59E0B14; border: 1px solid #F59E0B55; border-radius: 9px; color: #FBBF24; font-size: 13px; line-height: 1.55; }
.ov-warn svg { flex: 0 0 auto; margin-top: 2px; }
.ov-warn a { color: #FBBF24; text-decoration: underline; }
.ov-grid { display: grid; grid-template-columns: 1.35fr 1fr; gap: 16px; margin-bottom: 32px; }
.ov-panel { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; }
.ov-panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.ov-panel-head h2 { margin: 0 0 4px; font-size: 15px; font-weight: 650; color: #F8FAFC; }
.ov-panel-head p { margin: 0; font-size: 12px; color: #94A3B8; }
.ov-split { display: flex; gap: 28px; margin-bottom: 14px; }
.ov-split-item { display: flex; align-items: center; gap: 8px; }
.ov-split-item strong { font-size: 22px; font-weight: 700; color: #F8FAFC; }
.ov-split-item span { font-size: 12px; color: #94A3B8; }
.ov-bar { height: 9px; background: #EF4444; border-radius: 5px; overflow: hidden; }
.ov-bar-fill { height: 100%; background: #22C55E; }
.ov-note { margin: 14px 0 0; font-size: 12px; color: #64748B; line-height: 1.6; }
.ov-empty { padding: 26px 0; color: #64748B; font-size: 13px; }
.ov-empty p { margin: 0; }
.ov-fail-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; flex: 1; }
.ov-fail { display: flex; align-items: center; gap: 10px; background: #0F172A; border: 1px solid #334155; border-radius: 8px; padding: 9px 11px; }
.ov-fail-rank { width: 20px; height: 20px; display: grid; place-items: center; background: #F59E0B; color: #0F172A; border-radius: 50%; font-size: 10px; font-weight: 800; flex: 0 0 auto; }
.ov-fail-reason { flex: 1; font-size: 12px; color: #E2E8F0; word-break: break-word; }
.ov-fail-count { font-size: 11px; font-weight: 700; background: #EF444425; color: #EF4444; border-radius: 9px; padding: 2px 8px; flex: 0 0 auto; }
.section-heading { margin-bottom: 15px; }
.section-heading h2 { margin: 0 0 4px; font-size: 17px; font-weight: 650; color: #F8FAFC; }
.section-heading p { margin: 0; font-size: 13px; color: #94A3B8; }
.ov-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(255px, 1fr)); gap: 13px; }
.ov-link { background: #1E293B; border: 1px solid #334155; border-radius: 11px; padding: 17px; display: flex; flex-direction: column; gap: 6px; color: #F8FAFC; }
.ov-link:hover { border-color: #F59E0B; }
.ov-link svg { color: #F59E0B; margin-bottom: 4px; }
.ov-link strong { font-size: 14px; font-weight: 650; }
.ov-link span { font-size: 12px; color: #94A3B8; line-height: 1.5; }
.ov-link-disabled { opacity: .5; }
.ov-link-disabled:hover { border-color: #334155; }
.ov-link-disabled svg { color: #64748B; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 1000px) { .ov-grid { grid-template-columns: 1fr; } }
`

if (typeof document !== 'undefined' && !document.getElementById('overview-styles')) {
  const style = document.createElement('style')
  style.id = 'overview-styles'
  style.textContent = styles
  document.head.appendChild(style)
}