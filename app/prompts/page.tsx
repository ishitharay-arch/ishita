'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChevronDown, ArrowRight, CircleHelp, MoreHorizontal, AudioLines, LayoutDashboard, ClipboardCheck, Sparkles, MessageSquareText, Headphones, Settings2, Users, Bug, ListChecks, Plus, X, Save, Loader2, AlertTriangle, Bot as BotIcon, FileText, Upload, CheckCircle2, GitCompare, Gauge, Search } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot {
  id: string
  name: string
  department: string
}

interface PromptVersion {
  id: string
  version: number
  body: string
  isLive: boolean
  createdAt: string
  lineCount: number
  charCount: number
  gradedCount: number
  passedCount: number
  passRate: number | null
  lastGradedAt: string | null
}

type DiffLine = { type: 'same' | 'add' | 'remove'; text: string }

/** Line-level LCS diff. Prompt-sized inputs, so the O(n*m) table is fine. */
function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n')
  const B = b.split('\n')
  const n = A.length
  const m = B.length

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = A[i] === B[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ type: 'same', text: A[i] })
      i++; j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'remove', text: A[i] })
      i++
    } else {
      out.push({ type: 'add', text: B[j] })
      j++
    }
  }
  while (i < n) { out.push({ type: 'remove', text: A[i] }); i++ }
  while (j < m) { out.push({ type: 'add', text: B[j] }); j++ }
  return out
}

export default function PromptLibraryPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [orphanRuns, setOrphanRuns] = useState(0)
  const [loading, setLoading] = useState(true)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [compareId, setCompareId] = useState<string | null>(null)

  const [showNew, setShowNew] = useState(false)
  const [newBody, setNewBody] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedName, setUploadedName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBots() {
      try {
        const res = await fetch('/api/bots')
        if (res.ok) {
          const data = await res.json()
          const list = data.bots || []
          setBots(list)
          if (list.length > 0) setSelectedBotId(list[0].id)
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
    if (selectedBotId) fetchVersions()
  }, [selectedBotId])

  async function fetchVersions() {
    try {
      const res = await fetch(`/api/prompts?botId=${encodeURIComponent(selectedBotId)}`)
      if (res.ok) {
        const data = await res.json()
        const list: PromptVersion[] = data.versions || []
        setVersions(list)
        setOrphanRuns(data.orphanRuns || 0)
        setSelectedId(list.length > 0 ? list[0].id : null)
        setCompareId(list.length > 1 ? list[1].id : null)
      }
    } catch (e) {
      console.error('Failed to fetch versions:', e)
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
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
        setError(`${file.name} came back empty. If it's a scanned PDF, there may be no text layer.`)
        return
      }
      setNewBody(text.trim())
      setUploadedName(file.name)
    } catch (e) {
      console.error(e)
      setError(`Couldn't read ${file.name}.`)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function handleSaveVersion() {
    if (!newBody.trim() || !selectedBotId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botId: selectedBotId, body: newBody, setLive: true })
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Save failed')
        return
      }
      setShowNew(false)
      setNewBody('')
      setUploadedName(null)
      fetchVersions()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSetLive(id: string) {
    if (!confirm('Mark this version live? New eval runs will be recorded against it.')) return
    await fetch('/api/prompts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    fetchVersions()
  }

  const selected = versions.find(v => v.id === selectedId) || null
  const compare = versions.find(v => v.id === compareId) || null

  const diff = useMemo(() => {
    if (!selected || !compare || selected.id === compare.id) return null
    // Older on the left, newer on the right, so additions read as "what changed"
    const older = selected.version < compare.version ? selected : compare
    const newer = selected.version < compare.version ? compare : selected
    return { older, newer, lines: diffLines(older.body, newer.body) }
  }, [selected, compare])

  const diffStats = useMemo(() => {
    if (!diff) return null
    return {
      added: diff.lines.filter(l => l.type === 'add').length,
      removed: diff.lines.filter(l => l.type === 'remove').length
    }
  }, [diff])

  function fmtDate(s: string | null) {
    if (!s) return '—'
    const d = new Date(s)
    return isNaN(d.getTime()) ? s : d.toLocaleString()
  }

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Prompt library</strong></div>
          <div className="top-actions"><button className="icon-button"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><MessageSquareText size={14} /> Prompt history</div>
              <h1>Prompt library</h1>
              <p>
                Every version of a bot&apos;s system prompt, with the eval results recorded against it.
                Versions are never edited — a result whose prompt changed underneath it means nothing.
              </p>
            </div>
            {!showNew && versions.length > 0 && (
              <button className="primary-button" onClick={() => { setShowNew(true); setNewBody(''); setUploadedName(null); setError(null) }}>
                <Plus size={15} /> New version
              </button>
            )}
          </div>

          <div className="pl-botrow">
            <label>
              Bot
              <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>

          {error && <div className="pl-error"><AlertTriangle size={14} /> {error}</div>}

          {orphanRuns > 0 && (
            <div className="pl-warn">
              <AlertTriangle size={15} />
              <span>
                {orphanRuns} run{orphanRuns !== 1 ? 's' : ''} reference a prompt version that no longer exists,
                so their results can&apos;t be attributed to any version below. Those came from grading done before
                a prompt version was recorded.
              </span>
            </div>
          )}

          {showNew && (
            <div className="pl-new">
              <div className="pl-new-head">
                <h3>New prompt version</h3>
                <button className="icon-button" onClick={() => { setShowNew(false); setError(null) }}><X size={16} /></button>
              </div>
              <div className="pl-label-row">
                <label>Prompt body</label>
                <div className="pl-upload">
                  {uploadedName && <span className="pl-filename"><FileText size={12} /> {uploadedName}</span>}
                  <input type="file" accept=".pdf,.txt,.md" id="pv-upload" style={{ display: 'none' }} onChange={handleUpload} />
                  <label htmlFor="pv-upload" className="pl-upload-btn">
                    {uploading ? <><Loader2 size={12} className="spin" /> Reading...</> : <><Upload size={12} /> Upload file</>}
                  </label>
                </div>
              </div>
              <textarea value={newBody} onChange={e => setNewBody(e.target.value)} rows={14} placeholder="Paste the new prompt, or upload a .pdf, .txt or .md" />
              <div className="pl-new-actions">
                <span className="pl-hint">Saved as v{(versions[0]?.version || 0) + 1} and marked live.</span>
                <div>
                  <button className="ghost-button" onClick={() => { setShowNew(false); setError(null) }}>Cancel</button>
                  <button className="primary-button" onClick={handleSaveVersion} disabled={saving || !newBody.trim()}>
                    {saving ? <><Loader2 size={14} className="spin" /> Saving...</> : <><Save size={14} /> Save version</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="pl-loading"><Loader2 size={22} className="spin" /> Loading...</div>
          ) : versions.length === 0 ? (
            <div className="pl-empty">
              <MessageSquareText size={32} style={{ opacity: 0.3, marginBottom: 10 }} />
              <p>No prompt versions for this bot yet.</p>
              <button className="primary-button" onClick={() => { setShowNew(true); setError(null) }} style={{ marginTop: 14 }}>
                <Plus size={15} /> Add the first version
              </button>
            </div>
          ) : (
            <div className="pl-layout">
              <div className="pl-list">
                {versions.map(v => (
                  <button
                    key={v.id}
                    className={`pl-ver ${selectedId === v.id ? 'pl-ver-active' : ''}`}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <div className="pl-ver-top">
                      <strong>v{v.version}</strong>
                      {v.isLive && <span className="pl-live"><CheckCircle2 size={11} /> Live</span>}
                    </div>
                    <div className="pl-ver-rate">
                      {v.passRate !== null
                        ? <><Gauge size={12} /> {v.passRate.toFixed(1)}% <span>over {v.gradedCount} calls</span></>
                        : <span className="pl-nodata">Not evaluated yet</span>}
                    </div>
                    <div className="pl-ver-meta">{fmtDate(v.createdAt)}</div>
                  </button>
                ))}
              </div>

              <div className="pl-detail">
                {!selected ? (
                  <div className="pl-empty"><p>Pick a version.</p></div>
                ) : (
                  <>
                    <div className="pl-detail-head">
                      <div>
                        <div className="pl-detail-title">
                          <strong>Version {selected.version}</strong>
                          {selected.isLive
                            ? <span className="pl-live"><CheckCircle2 size={11} /> Live</span>
                            : <button className="pl-setlive" onClick={() => handleSetLive(selected.id)}>Mark live</button>}
                        </div>
                        <div className="pl-detail-meta">
                          <span>{fmtDate(selected.createdAt)}</span>
                          <span>{selected.lineCount} lines · {selected.charCount.toLocaleString()} chars</span>
                          {selected.passRate !== null && (
                            <span>{selected.passedCount}/{selected.gradedCount} passed ({selected.passRate.toFixed(1)}%)</span>
                          )}
                        </div>
                      </div>
                      {versions.length > 1 && (
                        <label className="pl-compare">
                          <GitCompare size={13} /> Compare with
                          <select value={compareId || ''} onChange={e => setCompareId(e.target.value || null)}>
                            <option value="">None</option>
                            {versions.filter(v => v.id !== selected.id).map(v => (
                              <option key={v.id} value={v.id}>v{v.version}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>

                    {diff && diffStats ? (
                      <>
                        <div className="pl-diff-bar">
                          Comparing <strong>v{diff.older.version}</strong> to <strong>v{diff.newer.version}</strong>
                          <span className="pl-add">+{diffStats.added}</span>
                          <span className="pl-rem">−{diffStats.removed}</span>
                          {diff.older.passRate !== null && diff.newer.passRate !== null && (
                            <span className="pl-delta">
                              Pass rate {diff.older.passRate.toFixed(1)}% → {diff.newer.passRate.toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="pl-diff">
                          {diff.lines.map((l, i) => (
                            <div key={i} className={`pl-dl pl-dl-${l.type}`}>
                              <span className="pl-dl-sign">{l.type === 'add' ? '+' : l.type === 'remove' ? '−' : ' '}</span>
                              <span className="pl-dl-text">{l.text || ' '}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <pre className="pl-body">{selected.body}</pre>
                    )}
                  </>
                )}
              </div>
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
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 20px; flex-wrap: wrap; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #94A3B8; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #F8FAFC; }
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; max-width: 680px; line-height: 1.6; }
.primary-button { background: #F59E0B; color: #0F172A; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.primary-button:disabled { opacity: .5; cursor: not-allowed; }
.ghost-button { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-right: 10px; }
.pl-botrow { margin-bottom: 18px; }
.pl-botrow label { font-size: 12px; font-weight: 600; color: #94A3B8; display: flex; flex-direction: column; gap: 6px; max-width: 280px; }
.pl-botrow select { background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; padding: 10px 12px; font-size: 13px; }
.pl-error { display: flex; align-items: center; gap: 8px; padding: 11px 13px; margin-bottom: 15px; background: #EF444414; border: 1px solid #EF444455; border-radius: 8px; color: #F87171; font-size: 13px; }
.pl-warn { display: flex; align-items: flex-start; gap: 9px; padding: 12px 14px; margin-bottom: 18px; background: #F59E0B14; border: 1px solid #F59E0B55; border-radius: 9px; color: #FBBF24; font-size: 12px; line-height: 1.55; }
.pl-warn svg { flex: 0 0 auto; margin-top: 2px; }
.pl-new { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 22px; }
.pl-new-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.pl-new-head h3 { margin: 0; font-size: 15px; color: #F8FAFC; }
.pl-label-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; flex-wrap: wrap; }
.pl-label-row label { font-size: 12px; font-weight: 600; color: #94A3B8; }
.pl-upload { display: flex; align-items: center; gap: 10px; }
.pl-filename { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: #4ADE80; }
.pl-upload-btn { display: inline-flex; align-items: center; gap: 6px; background: #334155; border: 1px solid #475569; color: #F8FAFC; border-radius: 7px; padding: 5px 11px; font-size: 11px; font-weight: 600; cursor: pointer; }
.pl-upload-btn:hover { border-color: #F59E0B; color: #F59E0B; }
.pl-new textarea { width: 100%; background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; line-height: 1.6; resize: vertical; }
.pl-new-actions { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 14px; flex-wrap: wrap; }
.pl-hint { font-size: 12px; color: #64748B; }
.pl-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px 0; color: #94A3B8; font-size: 14px; }
.pl-empty { text-align: center; padding: 50px 20px; color: #64748B; }
.pl-empty p { margin: 0; font-size: 14px; }
.pl-layout { display: grid; grid-template-columns: 250px 1fr; gap: 16px; align-items: start; }
.pl-list { display: flex; flex-direction: column; gap: 8px; max-height: 72vh; overflow-y: auto; }
.pl-ver { text-align: left; background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 13px; color: #F8FAFC; display: flex; flex-direction: column; gap: 6px; }
.pl-ver:hover { border-color: #475569; }
.pl-ver-active { border-color: #F59E0B; background: #263449; }
.pl-ver-top { display: flex; align-items: center; gap: 8px; }
.pl-ver-top strong { font-size: 14px; }
.pl-live { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 750; background: #22c55e22; color: #4ADE80; border-radius: 5px; padding: 2px 7px; text-transform: uppercase; letter-spacing: .04em; }
.pl-ver-rate { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #E2E8F0; font-weight: 600; }
.pl-ver-rate span { color: #64748B; font-weight: 400; font-size: 11px; }
.pl-nodata { color: #64748B; font-weight: 400; font-size: 11px; }
.pl-ver-meta { font-size: 10px; color: #64748B; }
.pl-detail { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; min-width: 0; max-height: 72vh; overflow-y: auto; }
.pl-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 1px solid #334155; padding-bottom: 14px; margin-bottom: 14px; flex-wrap: wrap; }
.pl-detail-title { display: flex; align-items: center; gap: 10px; }
.pl-detail-title strong { font-size: 16px; color: #F8FAFC; }
.pl-setlive { background: #334155; border: 1px solid #475569; color: #F8FAFC; border-radius: 6px; padding: 3px 10px; font-size: 11px; font-weight: 600; }
.pl-setlive:hover { border-color: #F59E0B; color: #F59E0B; }
.pl-detail-meta { display: flex; gap: 14px; margin-top: 7px; font-size: 11px; color: #64748B; flex-wrap: wrap; }
.pl-compare { display: flex; align-items: center; gap: 7px; font-size: 11px; color: #94A3B8; font-weight: 600; }
.pl-compare select { background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 6px; padding: 5px 8px; font-size: 11px; }
.pl-body { margin: 0; font-family: monospace; font-size: 12px; line-height: 1.7; color: #CBD5E1; white-space: pre-wrap; word-break: break-word; }
.pl-diff-bar { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #94A3B8; margin-bottom: 12px; flex-wrap: wrap; }
.pl-diff-bar strong { color: #F8FAFC; }
.pl-add { color: #4ADE80; font-weight: 700; }
.pl-rem { color: #F87171; font-weight: 700; }
.pl-delta { margin-left: auto; color: #FBBF24; font-weight: 600; }
.pl-diff { font-family: monospace; font-size: 12px; line-height: 1.65; border: 1px solid #334155; border-radius: 8px; overflow: hidden; }
.pl-dl { display: flex; gap: 8px; padding: 1px 10px; white-space: pre-wrap; word-break: break-word; }
.pl-dl-sign { flex: 0 0 10px; color: #64748B; }
.pl-dl-text { flex: 1; min-width: 0; }
.pl-dl-same { color: #94A3B8; }
.pl-dl-add { background: #22c55e14; color: #86EFAC; }
.pl-dl-add .pl-dl-sign { color: #4ADE80; }
.pl-dl-remove { background: #ef444414; color: #FCA5A5; }
.pl-dl-remove .pl-dl-sign { color: #F87171; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 940px) { .pl-layout { grid-template-columns: 1fr; } .pl-list { max-height: none; } }
`

if (typeof document !== 'undefined' && !document.getElementById('prompt-library-styles')) {
  const style = document.createElement('style')
  style.id = 'prompt-library-styles'
  style.textContent = styles
  document.head.appendChild(style)
}
