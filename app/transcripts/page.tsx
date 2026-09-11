'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ArrowRight, Search, CircleHelp, MoreHorizontal, AudioLines, LayoutDashboard, FlaskConical, ClipboardCheck, Sparkles, MessageSquareText, Headphones, Settings2, Users, Bug, ListChecks, X, Loader2, CheckCircle2, XCircle, AlertTriangle, Wrench, Bot as BotIcon, User, Cog, Info, FileText } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot {
  id: string
  name: string
  department: string
}

interface TranscriptListItem {
  id: string
  runId: string
  testCaseId: string
  passed: boolean
  failureCount: number
  failures: string[]
  transcriptSize: number
  botModel: string | null
  startedAt: string | null
  interactionId: string | null
}

interface Turn {
  speaker: 'CALLER' | 'BOT' | 'TOOL' | 'SYSTEM'
  text: string
}

interface TranscriptDetail {
  id: string
  runId: string
  testCaseId: string
  passed: boolean
  failures: string[]
  tools: string[]
  turns: Turn[]
  headerLike: boolean
  botModel: string | null
  startedAt: string | null
  scenarioType: string | null
  description: string | null
  interactionId: string | null
}

const SPEAKER_META: Record<string, { label: string; color: string; Icon: any }> = {
  BOT: { label: 'Bot', color: '#3B82F6', Icon: BotIcon },
  CALLER: { label: 'Caller', color: '#22C55E', Icon: User },
  TOOL: { label: 'Tool', color: '#F59E0B', Icon: Cog },
  SYSTEM: { label: 'System', color: '#94A3B8', Icon: Info }
}

const PAGE_SIZE = 25

export default function TranscriptsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [items, setItems] = useState<TranscriptListItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [flows, setFlows] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)

  const [verdict, setVerdict] = useState('')
  const [flow, setFlow] = useState('')
  const [query, setQuery] = useState('')

  const [detail, setDetail] = useState<TranscriptDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    async function fetchBots() {
      try {
        const res = await fetch('/api/grade-data')
        if (res.ok) {
          const data = await res.json()
          const csBots = data.bots.filter((b: Bot) => b.department === 'Customer Support')
          setBots(csBots)
          if (csBots.length > 0) setSelectedBotId(csBots[0].id)
        }
      } catch (e) {
        console.error('Failed to fetch bots:', e)
      } finally {
        setLoading(false)
      }
    }
    fetchBots()
  }, [])

  useEffect(() => {
    fetchList(0)
  }, [selectedBotId, verdict, flow])

  async function fetchList(newOffset: number) {
    setListLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(newOffset) })
      if (selectedBotId) params.set('botId', selectedBotId)
      if (verdict) params.set('verdict', verdict)
      if (flow) params.set('flow', flow)
      if (query.trim()) params.set('q', query.trim())

      const res = await fetch(`/api/transcripts?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItems(data.items || [])
        setTotal(data.total || 0)
        setFlows(data.flows || [])
        setOffset(newOffset)
      }
    } catch (e) {
      console.error('Failed to fetch transcripts:', e)
    } finally {
      setListLoading(false)
    }
  }

  async function openTranscript(id: string) {
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/transcripts?resultId=${encodeURIComponent(id)}`)
      const data = await res.json()
      if (data.success) setDetail(data.transcript)
    } catch (e) {
      console.error('Failed to load transcript:', e)
    } finally {
      setDetailLoading(false)
    }
  }

  function fmtDate(s: string | null) {
    if (!s) return '—'
    const d = new Date(s)
    if (isNaN(d.getTime())) return s
    return d.toLocaleString()
  }

  if (loading) {
    return (
      <main className="app-shell">
        <Sidebar />
        <section className="main-content">
          <header className="topbar">
            <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Transcripts</strong></div>
            <div className="top-actions"><div className="top-avatar">IA</div></div>
          </header>
          <div className="page-wrap"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}><Loader2 className="animate-spin" size={24} /><span style={{ marginLeft: 8 }}>Loading...</span></div></div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Transcripts</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Headphones size={14} /> Graded Calls</div>
              <h1>Transcripts</h1>
              <p>Every call the platform has graded, with its verdict and failures. Open one to read the conversation turn by turn.</p>
            </div>
          </div>

          <div className="tr-controls">
            <label className="tr-field">
              <span>Bot</span>
              <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                <option value="">All bots</option>
                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <label className="tr-field">
              <span>Verdict</span>
              <select value={verdict} onChange={e => setVerdict(e.target.value)}>
                <option value="">All</option>
                <option value="fail">Failed only</option>
                <option value="pass">Passed only</option>
              </select>
            </label>
            <label className="tr-field">
              <span>Detected flow</span>
              <select value={flow} onChange={e => setFlow(e.target.value)}>
                <option value="">All flows</option>
                {flows.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </label>
            <div className="tr-field tr-search-field">
              <span>Search failures</span>
              <div className="search-wrap">
                <Search size={14} />
                <input
                  placeholder="e.g. repetition, transfer, must_say"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') fetchList(0) }}
                />
                {query && <button className="tr-clear" onClick={() => { setQuery(''); fetchList(0) }}><X size={13} /></button>}
              </div>
            </div>
            <button className="btn-primary" onClick={() => fetchList(0)}>
              <Search size={14} /> Apply
            </button>
          </div>

          <div className="tr-count">
            {listLoading ? 'Loading...' : `${total} transcript${total !== 1 ? 's' : ''}`}
            {total > 0 && ` — showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)}`}
          </div>

          <div className="tr-layout">
            {/* List */}
            <div className="tr-list">
              {items.length === 0 && !listLoading ? (
                <div className="tr-empty">
                  <FileText size={30} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>No transcripts match these filters.</p>
                </div>
              ) : (
                items.map(it => (
                  <button
                    key={it.id}
                    className={`tr-row ${detail?.id === it.id ? 'tr-row-active' : ''} ${it.passed ? 'tr-row-pass' : 'tr-row-fail'}`}
                    onClick={() => openTranscript(it.id)}
                  >
                    <div className="tr-row-top">
                      {it.passed
                        ? <span className="tr-verdict tr-pass"><CheckCircle2 size={13} /> PASS</span>
                        : <span className="tr-verdict tr-fail"><XCircle size={13} /> FAIL</span>}
                      <span className="tr-flow">{it.testCaseId}</span>
                      {it.failureCount > 0 && <span className="tr-fcount">{it.failureCount}</span>}
                    </div>
                    {it.failures.length > 0 && (
                      <div className="tr-row-fail-list">
                        {it.failures.slice(0, 2).map((f, i) => <div key={i}>{f}</div>)}
                        {it.failures.length > 2 && <div className="tr-more">+{it.failures.length - 2} more</div>}
                      </div>
                    )}
                    <div className="tr-row-meta">{it.interactionId && <span className="tr-iid">{it.interactionId}</span>}{fmtDate(it.startedAt)}</div>
                  </button>
                ))
              )}

              {total > PAGE_SIZE && (
                <div className="tr-pager">
                  <button className="btn-ghost" disabled={offset === 0} onClick={() => fetchList(Math.max(0, offset - PAGE_SIZE))}>
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <button className="btn-ghost" disabled={offset + PAGE_SIZE >= total} onClick={() => fetchList(offset + PAGE_SIZE)}>
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Viewer */}
            <div className="tr-viewer">
              {detailLoading ? (
                <div className="tr-empty"><Loader2 size={22} className="animate-spin" /><p>Loading transcript...</p></div>
              ) : !detail ? (
                <div className="tr-empty">
                  <Headphones size={30} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>Pick a call on the left to read it.</p>
                </div>
              ) : (
                <>
                  <div className="tr-detail-head">
                    <div>
                      <div className="tr-detail-title">
                        {detail.passed
                          ? <span className="tr-verdict tr-pass"><CheckCircle2 size={14} /> PASS</span>
                          : <span className="tr-verdict tr-fail"><XCircle size={14} /> FAIL</span>}
                        <strong>{detail.testCaseId}</strong>
                        {detail.scenarioType && <span className="tr-scenario">{detail.scenarioType}</span>}
                      </div>
                      {detail.description && <p className="tr-detail-desc">{detail.description}</p>}
                      <div className="tr-detail-meta">
                        {detail.interactionId && <span style={{fontFamily:'monospace',color:'#CBD5E1'}}>{detail.interactionId}</span>}
                        <span>{detail.turns.length} turns</span>
                        <span>{fmtDate(detail.startedAt)}</span>
                        {detail.botModel && <span>{detail.botModel}</span>}
                      </div>
                    </div>
                    <button className="icon-button" onClick={() => setDetail(null)} title="Close"><X size={16} /></button>
                  </div>

                  {detail.failures.length > 0 && (
                    <div className="tr-failures">
                      <strong>Failures</strong>
                      <ul>{detail.failures.map((f, i) => <li key={i}>{f}</li>)}</ul>
                    </div>
                  )}

                  {detail.tools.length > 0 && (
                    <div className="tr-tools">
                      <Wrench size={13} /> Identifiers seen: {detail.tools.join(', ')}
                    </div>
                  )}

                  {detail.headerLike && (
                    <div className="tr-headerwarn">
                      <AlertTriangle size={14} />
                      <span>
                        The first turn below is the export&apos;s metadata header, stored as bot speech by the
                        transcript parser. It is also fed to the grader, so must_say and must_not_say checks
                        run against this text too.
                      </span>
                    </div>
                  )}

                  <div className="tr-turns">
                    {detail.turns.map((t, i) => {
                      const meta = SPEAKER_META[t.speaker] || SPEAKER_META.SYSTEM
                      const { Icon } = meta
                      const isHeader = i === 0 && detail.headerLike
                      return (
                        <div key={i} className={`tr-turn tr-turn-${t.speaker.toLowerCase()} ${isHeader ? 'tr-turn-header' : ''}`}>
                          <div className="tr-turn-side" style={{ color: meta.color }}>
                            <Icon size={13} />
                            <span>{isHeader ? 'Header' : meta.label}</span>
                          </div>
                          <div className="tr-turn-text">{t.text}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
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
.nav-item { display: flex; gap: 11px; align-items: center; color: #94A3B8; text-decoration: none; font-size: 12px; font-weight: 590; border-radius: 8px; padding: 10px 12px; }
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
.page-wrap { padding: 28px 32px 32px; flex: 1; min-width: 0; }
.page-heading { margin-bottom: 22px; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #94A3B8; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #F8FAFC; }
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; max-width: 720px; line-height: 1.55; }
.tr-controls { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px; }
.tr-field { display: flex; flex-direction: column; gap: 6px; }
.tr-field > span { font-size: 11px; font-weight: 600; color: #94A3B8; }
.tr-field select { background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; padding: 9px 12px; font-size: 13px; min-width: 140px; }
.tr-search-field { flex: 1; min-width: 240px; }
.search-wrap { display: flex; align-items: center; gap: 8px; background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 9px 12px; color: #94A3B8; }
.search-wrap input { flex: 1; background: transparent; border: none; outline: none; color: #F8FAFC; font-size: 13px; min-width: 0; }
.tr-clear { background: transparent; border: none; color: #94A3B8; padding: 0; display: flex; }
.btn-primary { background: #F59E0B; color: #0F172A; border: none; padding: 10px 16px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; }
.btn-ghost { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 7px 12px; border-radius: 7px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
.btn-ghost:disabled { opacity: .4; cursor: not-allowed; }
.tr-count { font-size: 12px; color: #94A3B8; margin-bottom: 12px; }
.tr-layout { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: start; }
.tr-list { display: flex; flex-direction: column; gap: 8px; max-height: 74vh; overflow-y: auto; padding-right: 4px; }
.tr-row { text-align: left; background: #1E293B; border: 1px solid #334155; border-left: 3px solid #334155; border-radius: 9px; padding: 12px 13px; color: #F8FAFC; display: flex; flex-direction: column; gap: 6px; }
.tr-row:hover { border-color: #475569; }
.tr-row-pass { border-left-color: #22C55E; }
.tr-row-fail { border-left-color: #EF4444; }
.tr-row-active { background: #263449; border-color: #F59E0B; }
.tr-row-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tr-verdict { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 750; letter-spacing: .03em; }
.tr-pass { color: #22C55E; }
.tr-fail { color: #EF4444; }
.tr-flow { font-size: 11px; font-family: monospace; background: #334155; color: #CBD5E1; border-radius: 4px; padding: 1px 6px; }
.tr-fcount { margin-left: auto; font-size: 10px; font-weight: 700; background: #EF444425; color: #EF4444; border-radius: 9px; padding: 1px 7px; }
.tr-row-fail-list { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #F87171; line-height: 1.45; }
.tr-more { color: #94A3B8; }
.tr-row-meta { font-size: 10px; color: #64748B; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tr-iid { font-family: monospace; font-size: 10px; color: #94A3B8; background: #334155; padding: 1px 6px; border-radius: 3px; word-break: break-all; }
.tr-pager { display: flex; justify-content: space-between; gap: 8px; padding-top: 6px; }
.tr-viewer { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; min-height: 320px; max-height: 74vh; overflow-y: auto; min-width: 0; }
.tr-empty { text-align: center; padding: 60px 20px; color: #64748B; display: flex; flex-direction: column; align-items: center; }
.tr-empty p { margin: 8px 0 0; font-size: 14px; }
.tr-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; border-bottom: 1px solid #334155; padding-bottom: 14px; margin-bottom: 14px; }
.tr-detail-title { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.tr-detail-title strong { font-size: 15px; color: #F8FAFC; }
.tr-scenario { font-size: 11px; font-family: monospace; background: #334155; color: #CBD5E1; border-radius: 4px; padding: 2px 7px; }
.tr-detail-desc { margin: 8px 0 0; font-size: 13px; color: #94A3B8; line-height: 1.5; }
.tr-detail-meta { display: flex; gap: 14px; margin-top: 8px; font-size: 11px; color: #64748B; flex-wrap: wrap; }
.tr-failures { background: #EF444412; border: 1px solid #EF444455; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
.tr-failures strong { display: block; font-size: 12px; color: #F87171; margin-bottom: 6px; }
.tr-failures ul { margin: 0; padding-left: 18px; }
.tr-failures li { font-size: 12px; color: #FCA5A5; margin-bottom: 4px; line-height: 1.5; }
.tr-tools { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #F59E0B; margin-bottom: 12px; font-family: monospace; }
.tr-headerwarn { display: flex; align-items: flex-start; gap: 9px; background: #F59E0B12; border: 1px solid #F59E0B55; border-radius: 8px; padding: 11px 13px; margin-bottom: 14px; font-size: 12px; color: #FBBF24; line-height: 1.5; }
.tr-headerwarn svg { flex: 0 0 auto; margin-top: 1px; }
.tr-turns { display: flex; flex-direction: column; gap: 9px; }
.tr-turn { display: flex; gap: 12px; align-items: flex-start; }
.tr-turn-side { flex: 0 0 74px; display: flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding-top: 8px; }
.tr-turn-text { flex: 1; background: #0F172A; border: 1px solid #253449; border-radius: 8px; padding: 9px 12px; font-size: 13px; line-height: 1.55; color: #E2E8F0; white-space: pre-wrap; word-break: break-word; min-width: 0; }
.tr-turn-caller .tr-turn-text { background: #12211A; border-color: #1E3A2A; }
.tr-turn-tool .tr-turn-text { background: #1E1708; border-color: #3F2E0A; font-family: monospace; font-size: 12px; }
.tr-turn-system .tr-turn-text { background: #161C26; border-color: #253449; color: #94A3B8; font-style: italic; }
.tr-turn-header .tr-turn-text { background: #241A05; border-color: #F59E0B55; color: #FBBF24; font-family: monospace; font-size: 11px; }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 1100px) {
  .tr-layout { grid-template-columns: 1fr; }
  .tr-list { max-height: none; }
}
`

if (typeof document !== 'undefined' && !document.getElementById('transcripts-styles')) {
  const style = document.createElement('style')
  style.id = 'transcripts-styles'
  style.textContent = styles
  document.head.appendChild(style)
}