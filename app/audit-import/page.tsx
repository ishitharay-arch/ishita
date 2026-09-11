'use client'

import { useState, useEffect } from 'react'
import {
  ArrowRight, CircleHelp, Loader2, AlertTriangle, CheckCircle2, XCircle,
  ClipboardCheck, Plus, Bug, Trash2, ChevronDown, Info, Search, Zap
} from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot {
  id: string
  name: string
  department: string
  use_case: string
}

interface Entry {
  id: string
  bot_id: string
  bot_display: string
  interaction_id: string
  auditor: string
  verdict: string | null
  error_label: string | null
  severity: string | null
  remarks: string | null
  department: string | null
  use_case: string | null
  detect_phrase: string | null
  promoted_to: string | null
  entered_via: string | null
  created_at: string
  grader_passed: number | null
  test_case_id: string | null
}

const SEVERITIES = ['', 'critical', 'major', 'minor']
const VERDICTS = ['', 'fail', 'partial', 'pass']

const emptyForm = () => ({
  interactionId: '',
  department: '',
  useCase: '',
  remarks: '',
  detectPhrase: '',
  errorLabel: '',
  severity: '',
  verdict: '',
  auditor: ''
})

export default function AuditImportPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [botId, setBotId] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/audit-entries')
      const j = await res.json()
      if (j.success) {
        setBots(j.bots || [])
        setEntries(j.entries || [])
        if (!botId && j.bots?.length) setBotId(j.bots[0].id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Department and use case default from the bot record, so the common case
  // is three fields rather than six.
  function pickBot(id: string) {
    setBotId(id)
    const b = bots.find(x => x.id === id)
    if (b) setForm(f => ({
      ...f,
      department: f.department || b.department || '',
      useCase: f.useCase || b.use_case || ''
    }))
  }

  async function save() {
    setSaving(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/audit-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', botId, ...form })
      })
      const j = await res.json()
      if (!j.success) { setError(j.error); return }
      setNotice(
        j.matchedGradedCall
          ? `Saved. This call has been graded — the grader ${j.graderPassed ? 'passed' : 'failed'} it, so it now counts toward agreement.`
          : 'Saved. This call has not been graded yet, so it will not appear in the agreement rate until it is.'
      )
      setForm(emptyForm())
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function promote(entry: Entry) {
    setError(null); setNotice(null)
    try {
      const res = await fetch('/api/audit-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'promote', entryId: entry.id })
      })
      const j = await res.json()
      if (!j.success) { setError(j.error); return }
      setNotice(j.message)
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function remove(entry: Entry) {
    if (!confirm(`Delete the entry for ${entry.interaction_id}?`)) return
    try {
      await fetch('/api/audit-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', entryId: entry.id })
      })
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  const shown = entries.filter(e => {
    if (!filter.trim()) return true
    const q = filter.toLowerCase()
    return [e.interaction_id, e.remarks, e.error_label, e.bot_display, e.use_case]
      .some(v => (v || '').toLowerCase().includes(q))
  })

  const canSave = botId && form.interactionId.trim() && form.remarks.trim()

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Audit Import</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><ClipboardCheck size={14} /> QC feedback</div>
              <h1>Audit Import</h1>
              <p>
                Log what went wrong on a real call. Entries are stored in the platform and
                referenced when grading, so an issue found once can be caught automatically
                from then on.
              </p>
            </div>
          </div>

          {error && <div className="ai-error"><AlertTriangle size={15} /> {error}</div>}
          {notice && <div className="ai-notice"><CheckCircle2 size={15} /> {notice}</div>}

          {/* Entry form */}
          <div className="ai-form">
            <div className="ai-form-head">
              <strong><Plus size={15} /> New entry</strong>
              <span>Interaction ID and remarks are required. The rest is optional.</span>
            </div>

            <div className="ai-grid">
              <div className="ai-field">
                <label>Voicebot</label>
                <div className="ai-select">
                  <select value={botId} onChange={e => pickBot(e.target.value)}>
                    {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>

              <div className="ai-field">
                <label>Interaction ID</label>
                <input
                  value={form.interactionId}
                  onChange={e => setForm({ ...form, interactionId: e.target.value })}
                  placeholder="Exotel call UUID or SID"
                />
              </div>

              <div className="ai-field">
                <label>Department</label>
                <input
                  value={form.department}
                  onChange={e => setForm({ ...form, department: e.target.value })}
                  placeholder="e.g. Customer Support"
                />
              </div>

              <div className="ai-field">
                <label>Voicebot use case</label>
                <input
                  value={form.useCase}
                  onChange={e => setForm({ ...form, useCase: e.target.value })}
                  placeholder="e.g. PEHC pre-booking"
                />
              </div>

              <div className="ai-field full">
                <label>Remarks</label>
                <textarea
                  rows={3}
                  value={form.remarks}
                  onChange={e => setForm({ ...form, remarks: e.target.value })}
                  placeholder="What went wrong on this call, in your own words"
                />
              </div>

              <div className="ai-field full ai-phrase">
                <label>
                  Detect phrase <span className="ai-optional">optional, but this is what makes it gradeable</span>
                </label>
                <input
                  value={form.detectPhrase}
                  onChange={e => setForm({ ...form, detectPhrase: e.target.value })}
                  placeholder="The words the bot actually said, e.g. sorry, I didn't catch that"
                />
                <small>
                  Remarks are evidence and stay as written. A phrase is what the grader can
                  check for. Add one here and you can turn this entry into an error pattern
                  with one click, after which every graded call is checked for it.
                </small>
              </div>

              <div className="ai-field">
                <label>Error label</label>
                <input
                  value={form.errorLabel}
                  onChange={e => setForm({ ...form, errorLabel: e.target.value })}
                  placeholder="e.g. asr_retry_loop"
                />
              </div>

              <div className="ai-field">
                <label>Severity</label>
                <div className="ai-select">
                  <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {SEVERITIES.map(s => <option key={s} value={s}>{s || 'not set'}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </div>
              </div>

              <div className="ai-field">
                <label>Verdict</label>
                <div className="ai-select">
                  <select value={form.verdict} onChange={e => setForm({ ...form, verdict: e.target.value })}>
                    {VERDICTS.map(v => <option key={v} value={v}>{v || 'not set'}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </div>
                <small>Only entries with a verdict count toward the agreement rate.</small>
              </div>

              <div className="ai-field">
                <label>Your name</label>
                <input
                  value={form.auditor}
                  onChange={e => setForm({ ...form, auditor: e.target.value })}
                  placeholder="e.g. Ishitha"
                />
              </div>
            </div>

            <div className="ai-form-actions">
              <button className="ghost-button" onClick={() => setForm(emptyForm())}>Clear</button>
              <button className="primary-button" onClick={save} disabled={saving || !canSave}>
                {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : <>Save entry</>}
              </button>
            </div>
          </div>

          {/* Entries */}
          <div className="ai-list-head">
            <h2>Logged entries <span className="ai-count">{entries.length}</span></h2>
            <div className="ai-search">
              <Search size={14} />
              <input
                placeholder="Filter by ID, remark, label or bot"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="ai-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : shown.length === 0 ? (
            <div className="ai-empty">
              <ClipboardCheck size={30} style={{ opacity: .3, marginBottom: 10 }} />
              <p>{entries.length === 0 ? 'Nothing logged yet.' : 'No entries match that filter.'}</p>
            </div>
          ) : (
            <div className="ai-rows">
              {shown.map(e => (
                <div className="ai-row" key={e.id}>
                  <div className="ai-row-main">
                    <div className="ai-row-top">
                      <span className="ai-bot">{e.bot_display}</span>
                      {e.use_case && <span className="ai-usecase">{e.use_case}</span>}
                      {e.verdict && (
                        <span className={`ai-verdict ai-v-${e.verdict}`}>
                          {e.verdict === 'pass' ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {e.verdict}
                        </span>
                      )}
                      {e.severity && <span className={`ai-sev ai-sev-${e.severity}`}>{e.severity}</span>}
                      {e.error_label && <span className="ai-label"><Bug size={10} /> {e.error_label}</span>}
                      {e.promoted_to && <span className="ai-promoted"><Zap size={10} /> pattern active</span>}
                    </div>

                    {e.remarks && <p className="ai-remark">{e.remarks}</p>}

                    {e.detect_phrase && (
                      <div className="ai-phrase-shown">
                        <span>phrase</span> <code>{e.detect_phrase}</code>
                      </div>
                    )}

                    <div className="ai-row-meta">
                      <span className="ai-id">{e.interaction_id}</span>
                      <span>{e.auditor}</span>
                      {e.grader_passed === null
                        ? <span className="ai-ungraded">not graded yet</span>
                        : <span className={e.grader_passed ? 'ai-gpass' : 'ai-gfail'}>
                            grader {e.grader_passed ? 'passed' : 'failed'} it
                            {e.test_case_id ? ` (${e.test_case_id})` : ''}
                          </span>}
                    </div>
                  </div>

                  <div className="ai-row-actions">
                    {!e.promoted_to && e.detect_phrase && (
                      <button className="ai-promote" onClick={() => promote(e)} title="Turn this into an error pattern">
                        <Zap size={13} /> Make a pattern
                      </button>
                    )}
                    {!e.promoted_to && !e.detect_phrase && (
                      <span className="ai-nophrase" title="Add a detect phrase to make this gradeable">
                        <Info size={12} /> no phrase
                      </span>
                    )}
                    <button className="icon-button" onClick={() => remove(e)} title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
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
.ai-error { display: flex; align-items: center; gap: 9px; padding: 12px 14px; margin-bottom: 16px; background: #EF444414; border: 1px solid #EF444455; border-radius: 9px; color: #F87171; font-size: 13px; }
.ai-notice { display: flex; align-items: center; gap: 9px; padding: 12px 14px; margin-bottom: 16px; background: #22C55E14; border: 1px solid #22C55E55; border-radius: 9px; color: #4ADE80; font-size: 13px; line-height: 1.5; }
.ai-form { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 26px; }
.ai-form-head { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.ai-form-head strong { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #F8FAFC; }
.ai-form-head span { font-size: 12px; color: #64748B; }
.ai-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.ai-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ai-field.full { grid-column: 1 / -1; }
.ai-field label { font-size: 12px; font-weight: 600; color: #94A3B8; }
.ai-optional { font-weight: 500; color: #64748B; font-size: 11px; }
.ai-field input, .ai-field textarea { background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; padding: 11px 12px; font-size: 13px; min-height: 44px; }
.ai-field textarea { min-height: 76px; line-height: 1.55; resize: vertical; }
.ai-field small { font-size: 11px; color: #64748B; line-height: 1.55; }
.ai-select { position: relative; display: flex; }
.ai-select select { appearance: none; width: 100%; background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; padding: 11px 34px 11px 12px; font-size: 13px; min-height: 44px; cursor: pointer; }
.ai-select svg { position: absolute; right: 11px; top: 50%; transform: translateY(-50%); pointer-events: none; color: #94A3B8; }
.ai-phrase { background: #F59E0B0A; border: 1px solid #F59E0B33; border-radius: 9px; padding: 13px; }
.ai-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.ai-list-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.ai-list-head h2 { display: flex; align-items: center; gap: 9px; margin: 0; font-size: 17px; font-weight: 650; color: #F8FAFC; }
.ai-count { font-size: 11px; font-weight: 700; background: #334155; color: #CBD5E1; border-radius: 9px; padding: 2px 9px; }
.ai-search { display: flex; align-items: center; gap: 8px; background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 0 12px; color: #94A3B8; min-height: 44px; min-width: 260px; }
.ai-search input { flex: 1; background: transparent; border: none; outline: none; color: #F8FAFC; font-size: 13px; min-width: 0; }
.ai-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 50px 0; color: #94A3B8; font-size: 14px; }
.ai-empty { text-align: center; padding: 50px 20px; color: #64748B; }
.ai-empty p { margin: 0; font-size: 14px; }
.ai-rows { display: flex; flex-direction: column; gap: 9px; }
.ai-row { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; background: #1E293B; border: 1px solid #334155; border-radius: 9px; padding: 14px 15px; }
.ai-row-main { flex: 1; min-width: 0; }
.ai-row-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ai-bot { font-size: 12px; font-weight: 650; color: #F8FAFC; }
.ai-usecase { font-size: 11px; color: #94A3B8; }
.ai-verdict { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px; }
.ai-v-pass { background: #22C55E20; color: #4ADE80; }
.ai-v-fail { background: #EF444420; color: #F87171; }
.ai-v-partial { background: #F59E0B20; color: #FBBF24; }
.ai-sev { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px; }
.ai-sev-critical { background: #EF444425; color: #F87171; }
.ai-sev-major { background: #F59E0B25; color: #FBBF24; }
.ai-sev-minor { background: #334155; color: #94A3B8; }
.ai-label { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-family: monospace; background: #334155; color: #CBD5E1; border-radius: 4px; padding: 2px 7px; }
.ai-promoted { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; background: #22C55E20; color: #4ADE80; border-radius: 4px; padding: 2px 7px; }
.ai-remark { margin: 9px 0 0; font-size: 13px; color: #E2E8F0; line-height: 1.55; }
.ai-phrase-shown { margin-top: 9px; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #94A3B8; flex-wrap: wrap; }
.ai-phrase-shown code { font-family: monospace; font-size: 12px; background: #0F172A; border: 1px solid #F59E0B44; color: #FBBF24; border-radius: 5px; padding: 3px 8px; }
.ai-row-meta { display: flex; gap: 14px; margin-top: 9px; font-size: 11px; color: #64748B; flex-wrap: wrap; }
.ai-id { font-family: monospace; }
.ai-ungraded { color: #64748B; }
.ai-gpass { color: #4ADE80; }
.ai-gfail { color: #F87171; }
.ai-row-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.ai-promote { display: inline-flex; align-items: center; gap: 6px; background: #334155; border: 1px solid #F59E0B66; color: #FBBF24; border-radius: 8px; padding: 0 13px; min-height: 44px; font-size: 12px; font-weight: 650; }
.ai-promote:hover { background: #F59E0B14; border-color: #F59E0B; }
.ai-nophrase { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #64748B; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 820px) {
  .ai-grid { grid-template-columns: 1fr; }
  .ai-row { flex-direction: column; }
}
`

if (typeof document !== 'undefined' && !document.getElementById('audit-import-styles')) {
  const style = document.createElement('style')
  style.id = 'audit-import-styles'
  style.textContent = styles
  document.head.appendChild(style)
}