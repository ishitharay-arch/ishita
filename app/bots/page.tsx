'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ArrowRight, Search, CircleHelp, MoreHorizontal, AudioLines, LayoutDashboard, ClipboardCheck, Sparkles, MessageSquareText, Headphones, Settings2, Users, Bug, ListChecks, Plus, Pencil, Trash2, X, Save, Loader2, AlertTriangle, Bot as BotIcon, FileText, Eye, EyeOff, Activity, CheckCircle2, Upload } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface PromptVersion {
  id: string
  version: number
  body: string
  isLive: boolean
  createdAt: string
}

interface Bot {
  id: string
  name: string
  department: string
  use_case: string
  prd: string
  created_at: string
  latestPrompt: PromptVersion | null
  testCasesCount: number
  patternsCount: number
  runsCount: number
}

const DEPARTMENTS = ['Customer Support', 'Sales', 'Operations', 'Clinical', 'Other']

const emptyForm = () => ({
  name: '',
  useCase: '',
  department: 'Customer Support',
  systemPrompt: '',
  prd: ''
})

export default function BotsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // --- document upload for prompt / PRD ---
  // PDFs go through the existing /api/parse-pdf route; text formats are read
  // in the browser. Extracted text lands in the textarea so it stays editable
  // before saving, and everything downstream keeps working with plain text.
  const [uploading, setUploading] = useState<'systemPrompt' | 'prd' | null>(null)
  const [uploadedName, setUploadedName] = useState<{ systemPrompt?: string; prd?: string }>({})

  useEffect(() => { fetchBots() }, [])

  async function fetchBots() {
    try {
      const res = await fetch('/api/bots')
      if (res.ok) {
        const data = await res.json()
        setBots(data.bots || [])
      }
    } catch (e) {
      console.error('Failed to fetch bots:', e)
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyForm())
    setUploadedName({})
    setEditingId(null)
    setError(null)
    setNotice(null)
    setShowForm(true)
  }

  function openEdit(b: Bot) {
    setForm({
      name: b.name,
      useCase: b.use_case || '',
      department: b.department || 'Customer Support',
      systemPrompt: b.latestPrompt?.body || '',
      prd: b.prd || ''
    })
    setUploadedName({})
    setEditingId(b.id)
    setError(null)
    setNotice(null)
    setShowForm(true)
  }

  async function handleDocUpload(
    field: 'systemPrompt' | 'prd',
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(field)
    setError(null)

    try {
      let text = ''

      if (file.name.toLowerCase().endsWith('.pdf')) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) {
          setError(`Couldn't read ${file.name}: ${json.error || res.status}`)
          return
        }
        text = json.text || ''
      } else {
        text = await file.text()
      }

      if (!text.trim()) {
        setError(`${file.name} came back empty. If it's a scanned PDF, the text layer may be missing.`)
        return
      }

      setForm(f => ({ ...f, [field]: text.trim() }))
      setUploadedName(n => ({ ...n, [field]: file.name }))
    } catch (e) {
      console.error('Upload failed:', e)
      setError(`Couldn't read ${file.name}. See console.`)
    } finally {
      setUploading(null)
      event.target.value = ''
    }
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Bot name is required.')
      return
    }
    setSaving(true)
    setError(null)

    try {
      const res = editingId
        ? await fetch(`/api/bots/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
          })
        : await fetch('/api/bots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form)
          })

      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Save failed')
        return
      }

      if (json.newPromptVersion) {
        setNotice(`Prompt changed — saved as v${json.newPromptVersion}. The previous version is kept for comparison.`)
      }

      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      fetchBots()
    } catch (e) {
      console.error('Save failed:', e)
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: Bot) {
    if (!confirm(`Delete ${b.name}?`)) return

    let res = await fetch(`/api/bots/${b.id}`, { method: 'DELETE' })
    let json = await res.json()

    if (!json.success && json.needsForce) {
      const ok = confirm(`${json.error}\n\nDelete anyway? Past runs and results are kept.`)
      if (!ok) return
      res = await fetch(`/api/bots/${b.id}?force=true`, { method: 'DELETE' })
      json = await res.json()
    }

    if (!json.success) {
      alert(json.error || 'Delete failed')
      return
    }
    fetchBots()
  }

  function toggleExpanded(id: string) {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Bots</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><BotIcon size={14} /> Bot registry</div>
              <h1>Bots</h1>
              <p>
                Each bot owns its own test cases, error patterns and prompt history.
                The system prompt and PRD recorded here are the reference for everything graded against that bot.
              </p>
            </div>
            {!showForm && <button className="primary-button" onClick={openCreate}><Plus size={15} /> Add bot</button>}
          </div>

          {notice && <div className="bt-notice"><CheckCircle2 size={15} /> {notice}</div>}

          {showForm && (
            <div className="bt-form">
              <div className="bt-form-head">
                <h3>{editingId ? 'Edit bot' : 'New bot'}</h3>
                <button className="icon-button" onClick={() => { setShowForm(false); setEditingId(null); setError(null) }}><X size={16} /></button>
              </div>

              {error && <div className="bt-error"><AlertTriangle size={14} /> {error}</div>}

              <div className="bt-grid">
                <div className="bt-field">
                  <label>Bot name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sameeksha" />
                </div>
                <div className="bt-field">
                  <label>Department</label>
                  <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="bt-field full">
                  <label>Use case</label>
                  <input value={form.useCase} onChange={e => setForm({ ...form, useCase: e.target.value })} placeholder="e.g. Pre-employment health checkup pre-booking, inbound" />
                </div>
                <div className="bt-field full">
                  <div className="bt-label-row">
                    <label>System prompt</label>
                    <div className="bt-upload">
                      {uploadedName.systemPrompt && <span className="bt-filename"><FileText size={12} /> {uploadedName.systemPrompt}</span>}
                      <input type="file" accept=".pdf,.txt,.md" id="prompt-upload" style={{ display: 'none' }} onChange={e => handleDocUpload('systemPrompt', e)} />
                      <label htmlFor="prompt-upload" className="bt-upload-btn">
                        {uploading === 'systemPrompt' ? <><Loader2 size={12} className="spin" /> Reading...</> : <><Upload size={12} /> Upload file</>}
                      </label>
                    </div>
                  </div>
                  <textarea value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} rows={10} placeholder="Paste the bot's current system prompt, or upload a .pdf, .txt or .md" />
                  <small>
                    {editingId
                      ? 'Editing this creates a new prompt version. The current one is kept so you can compare eval results across versions.'
                      : 'Saved as version 1.'}
                  </small>
                </div>
                <div className="bt-field full">
                  <div className="bt-label-row">
                    <label>PRD</label>
                    <div className="bt-upload">
                      {uploadedName.prd && <span className="bt-filename"><FileText size={12} /> {uploadedName.prd}</span>}
                      <input type="file" accept=".pdf,.txt,.md" id="prd-upload" style={{ display: 'none' }} onChange={e => handleDocUpload('prd', e)} />
                      <label htmlFor="prd-upload" className="bt-upload-btn">
                        {uploading === 'prd' ? <><Loader2 size={12} className="spin" /> Reading...</> : <><Upload size={12} /> Upload file</>}
                      </label>
                    </div>
                  </div>
                  <textarea value={form.prd} onChange={e => setForm({ ...form, prd: e.target.value })} rows={8} placeholder="What this bot is meant to do, the flows it must handle, and what counts as success — or upload a .pdf, .txt or .md" />
                  <small>Used as the reference for what the bot is supposed to do when writing test cases.</small>
                </div>
              </div>

              <div className="bt-form-actions">
                <button className="ghost-button" onClick={() => { setShowForm(false); setEditingId(null); setError(null) }}>Cancel</button>
                <button className="primary-button" onClick={handleSave} disabled={saving || !form.name.trim()}>
                  {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : <><Save size={14} /> {editingId ? 'Save changes' : 'Create bot'}</>}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="bt-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : bots.length === 0 ? (
            <div className="bt-empty">
              <BotIcon size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
              <p>No bots yet. Add one to start grading its calls.</p>
            </div>
          ) : (
            <div className="bt-list">
              {bots.map(b => {
                const isOpen = expanded.has(b.id)
                const setUp = b.testCasesCount > 0
                return (
                  <div className="bt-card" key={b.id}>
                    <div className="bt-card-head">
                      <div className="bt-card-title">
                        <span className="bt-avatar"><BotIcon size={16} /></span>
                        <div>
                          <strong>{b.name}</strong>
                          <div className="bt-tags">
                            <span className="bt-tag">{b.department}</span>
                            {b.latestPrompt && <span className="bt-tag bt-tag-blue">Prompt v{b.latestPrompt.version}</span>}
                            {!setUp && <span className="bt-tag bt-tag-amber">No test cases</span>}
                          </div>
                        </div>
                      </div>
                      <div className="bt-card-actions">
                        <button className="icon-button" title="Edit" onClick={() => openEdit(b)}><Pencil size={14} /></button>
                        <button className="icon-button" title="Delete" onClick={() => handleDelete(b)}><Trash2 size={14} /></button>
                      </div>
                    </div>

                    {b.use_case && <p className="bt-usecase">{b.use_case}</p>}

                    <div className="bt-counts">
                      <span><ListChecks size={13} /> {b.testCasesCount} test case{b.testCasesCount !== 1 ? 's' : ''}</span>
                      <span><Bug size={13} /> {b.patternsCount} active pattern{b.patternsCount !== 1 ? 's' : ''}</span>
                      <span><Activity size={13} /> {b.runsCount} run{b.runsCount !== 1 ? 's' : ''}</span>
                    </div>

                    {(b.latestPrompt || b.prd) && (
                      <button className="bt-toggle" onClick={() => toggleExpanded(b.id)}>
                        {isOpen ? <EyeOff size={13} /> : <Eye size={13} />} {isOpen ? 'Hide' : 'Show'} prompt and PRD
                      </button>
                    )}

                    {isOpen && (
                      <div className="bt-docs">
                        {b.latestPrompt && (
                          <div className="bt-doc">
                            <div className="bt-doc-head">
                              <FileText size={13} /> System prompt
                              <span className="bt-tag bt-tag-blue">v{b.latestPrompt.version}</span>
                              {b.latestPrompt.isLive && <span className="bt-tag bt-tag-green">Live</span>}
                            </div>
                            <pre>{b.latestPrompt.body}</pre>
                          </div>
                        )}
                        {b.prd && (
                          <div className="bt-doc">
                            <div className="bt-doc-head"><FileText size={13} /> PRD</div>
                            <pre>{b.prd}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
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
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; max-width: 680px; line-height: 1.6; }
.primary-button { background: #F59E0B; color: #0F172A; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.primary-button:disabled { opacity: .5; cursor: not-allowed; }
.ghost-button { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.bt-notice { display: flex; align-items: center; gap: 9px; padding: 12px 14px; margin-bottom: 18px; background: #22C55E14; border: 1px solid #22C55E55; border-radius: 9px; color: #4ADE80; font-size: 13px; }
.bt-error { display: flex; align-items: center; gap: 8px; padding: 11px 13px; margin-bottom: 15px; background: #EF444414; border: 1px solid #EF444455; border-radius: 8px; color: #F87171; font-size: 13px; }
.bt-form { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 22px; margin-bottom: 24px; }
.bt-form-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.bt-form-head h3 { margin: 0; font-size: 16px; color: #F8FAFC; }
.bt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.bt-field { display: flex; flex-direction: column; gap: 6px; }
.bt-field.full { grid-column: 1 / -1; }
.bt-field label { font-size: 12px; font-weight: 600; color: #94A3B8; }
.bt-field input, .bt-field select, .bt-field textarea { background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.bt-field textarea { font-family: monospace; font-size: 12px; line-height: 1.6; resize: vertical; }
.bt-field small { font-size: 11px; color: #64748B; line-height: 1.5; }
.bt-label-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.bt-upload { display: flex; align-items: center; gap: 10px; }
.bt-filename { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #4ADE80; }
.bt-upload-btn { display: inline-flex; align-items: center; gap: 6px; background: #334155; border: 1px solid #475569; color: #F8FAFC; border-radius: 7px; padding: 5px 11px; font-size: 11px; font-weight: 600; cursor: pointer; }
.bt-upload-btn:hover { border-color: #F59E0B; color: #F59E0B; }
.bt-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.bt-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px 0; color: #94A3B8; font-size: 14px; }
.bt-empty { text-align: center; padding: 60px 20px; color: #64748B; }
.bt-empty p { margin: 0; font-size: 14px; }
.bt-list { display: flex; flex-direction: column; gap: 12px; }
.bt-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 18px; }
.bt-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.bt-card-title { display: flex; gap: 12px; align-items: flex-start; }
.bt-avatar { width: 34px; height: 34px; display: grid; place-items: center; background: #3b82f6; color: #fff; border-radius: 9px; flex: 0 0 auto; }
.bt-card-title strong { font-size: 15px; color: #F8FAFC; display: block; margin-bottom: 5px; }
.bt-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.bt-tag { font-size: 10px; font-weight: 650; padding: 2px 8px; border-radius: 5px; background: #334155; color: #CBD5E1; }
.bt-tag-blue { background: #3b82f622; color: #60A5FA; }
.bt-tag-green { background: #22c55e22; color: #4ADE80; }
.bt-tag-amber { background: #f59e0b22; color: #FBBF24; }
.bt-card-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.bt-usecase { margin: 12px 0 0; font-size: 13px; color: #94A3B8; line-height: 1.55; }
.bt-counts { display: flex; gap: 18px; margin-top: 12px; flex-wrap: wrap; }
.bt-counts span { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #64748B; }
.bt-toggle { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; background: transparent; border: none; color: #F59E0B; font-size: 12px; font-weight: 650; padding: 0; }
.bt-docs { margin-top: 14px; display: flex; flex-direction: column; gap: 12px; }
.bt-doc { border: 1px solid #334155; border-radius: 9px; overflow: hidden; }
.bt-doc-head { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: #0F172A; font-size: 11px; font-weight: 650; color: #94A3B8; border-bottom: 1px solid #334155; }
.bt-doc pre { margin: 0; padding: 14px; font-size: 12px; line-height: 1.65; color: #CBD5E1; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; font-family: monospace; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 760px) { .bt-grid { grid-template-columns: 1fr; } }
`

if (typeof document !== 'undefined' && !document.getElementById('bots-styles')) {
  const style = document.createElement('style')
  style.id = 'bots-styles'
  style.textContent = styles
  document.head.appendChild(style)
}