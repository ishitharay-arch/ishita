'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ArrowRight, Search, CircleHelp, MoreHorizontal, AudioLines, LayoutDashboard, FlaskConical, ClipboardCheck, Sparkles, MessageSquareText, Headphones, Settings2, Users, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, AlertTriangle, Shield, Bug, BookOpen, Filter, X, Save, Eye, EyeOff, Loader2, AlertOctagon, Info, Zap, Activity, Upload, FileText, Check, CheckCheck, ListChecks, FileSearch , Bot as BotIcon } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot {
  id: string
  name: string
  department: string
}

interface DetectionConfig {
  target?: string
  mode?: string
  phrases?: string[]
  pattern?: string
  should_match?: boolean
  check?: string
  threshold?: number
}

interface ErrorPattern {
  id: string
  bot_id: string
  name: string
  description: string
  severity: 'critical' | 'major' | 'minor'
  error_type: string
  stage: string
  detection_method: 'keyword' | 'regex' | 'behavioral'
  detection_config: string
  source: 'manual' | 'auto_detected'
  active: number
  times_triggered: number
  created_at: string
  updated_at: string
}

interface Evidence {
  callNumber: number
  excerpt: string
}

interface PatternCandidate {
  kind: 'pattern'
  suggestedName: string
  description: string
  severity: 'critical' | 'major' | 'minor'
  errorType: string
  stage: string
  detectionMethod: 'keyword' | 'regex' | 'behavioral'
  detectionConfig: Record<string, any>
  callCount: number
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  evidence: Evidence[]
}

const CONFIDENCE_COLORS: Record<string, string> = { high: '#22C55E', medium: '#F59E0B', low: '#94A3B8' }

const SEVERITY_OPTIONS = ['critical', 'major', 'minor']
const ERROR_TYPE_OPTIONS = ['repetition', 'hallucination', 'wrong_flow', 'missed_intent', 'wrong_data', 'language', 'compliance', 'timeout', 'other']
const STAGE_OPTIONS = ['greeting', 'identification', 'resolution', 'closing', 'transfer', 'any']
const DETECTION_METHOD_OPTIONS = ['keyword', 'regex', 'behavioral']

const SEVERITY_COLORS: Record<string, string> = { critical: '#EF4444', major: '#F59E0B', minor: '#3B82F6' }
const SEVERITY_ICONS: Record<string, any> = { critical: AlertOctagon, major: AlertTriangle, minor: Info }

const emptyForm: () => {
  name: string; description: string; severity: string; errorType: string; stage: string;
  detectionMethod: string; target: string; mode: string; phrases: string; pattern: string;
  shouldMatch: boolean; check: string; threshold: number
} = () => ({
  name: '', description: '', severity: 'major', errorType: 'other', stage: 'any',
  detectionMethod: 'keyword', target: 'bot', mode: 'contains', phrases: '',
  pattern: '', shouldMatch: true, check: 'repeat_count', threshold: 3
})

export default function ErrorKBPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const [patterns, setPatterns] = useState<ErrorPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [filterSeverity, setFilterSeverity] = useState<string>('')
  const [filterType, setFilterType] = useState<string>('')
  const [filterStage, setFilterStage] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')

  // --- Suggestions tab state ---
  const [tab, setTab] = useState<'patterns' | 'suggestions'>('patterns')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [candidates, setCandidates] = useState<PatternCandidate[] | null>(null)
  const [callsAnalysed, setCallsAnalysed] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState<Set<number>>(new Set())
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set())
  const [accepting, setAccepting] = useState(false)
  const [acceptedCount, setAcceptedCount] = useState<number | null>(null)
  const [analyseError, setAnalyseError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchBots() {
      try {
        const response = await fetch('/api/grade-data')
        if (response.ok) {
          const data = await response.json()
          const csBots = data.bots.filter((bot: Bot) => bot.department === 'Customer Support')
          setBots(csBots)
          if (csBots.length > 0) setSelectedBotId(csBots[0].id)
        }
      } catch (error) {
        console.error('Failed to fetch bots:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchBots()
  }, [])

  useEffect(() => {
    if (selectedBotId) fetchPatterns()
  }, [selectedBotId])

  async function fetchPatterns() {
    try {
      const params = new URLSearchParams({ botId: selectedBotId, activeOnly: 'false' })
      const res = await fetch(`/api/error-patterns?${params}`)
      if (res.ok) {
        const data = await res.json()
        setPatterns(data.patterns || [])
      }
    } catch (error) {
      console.error('Failed to fetch patterns:', error)
    }
  }


  // ------------------------------------------------------------
  // Suggestions: analyse transcripts -> candidates -> accept
  // ------------------------------------------------------------

  // Same UUID-header split the bulk-grade page uses, so one PDF of many
  // calls becomes many transcripts.
  function splitTranscripts(input: string): string[] {
    const uuidPattern = /\d+\.\s+[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi
    const matches = [...input.matchAll(uuidPattern)]
    if (matches.length >= 1) {
      const out: string[] = []
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index!
        const end = i < matches.length - 1 ? matches[i + 1].index! : input.length
        const chunk = input.slice(start, end).trim()
        if (chunk) out.push(chunk)
      }
      if (out.length) return out
    }
    const trimmed = input.trim()
    return trimmed ? [trimmed] : []
  }

  async function handleSuggestionFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    setAnalyseError(null)

    if (file.name.toLowerCase().endsWith('.pdf')) {
      setTranscriptText('')
      try {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) {
          setAnalyseError(`PDF parse failed: ${json.error || res.status}`)
          setUploadedFile(null)
          return
        }
        setTranscriptText(json.text)
      } catch (err) {
        console.error('PDF upload failed:', err)
        setAnalyseError('PDF upload failed — see console.')
        setUploadedFile(null)
      }
      return
    }

    setTranscriptText(await file.text())
  }

  async function handleAnalyse() {
    if (!transcriptText.trim() || !selectedBotId) return
    setAnalysing(true)
    setCandidates(null)
    setAcceptedCount(null)
    setAnalyseError(null)

    try {
      const chunks = splitTranscripts(transcriptText)
      const selectedBot = bots.find(b => b.id === selectedBotId)
      const res = await fetch('/api/analyse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBotId,
          botName: selectedBot?.name,
          calls: chunks.map((t, i) => ({ callNumber: i + 1, transcriptText: t }))
        })
      })
      const json = await res.json()
      if (!json.success) {
        setAnalyseError(json.error || 'Analysis failed')
        return
      }
      setCandidates(json.patternCandidates || [])
      setCallsAnalysed(json.callsAnalysed || chunks.length)
      setSelectedIdx(new Set())
      setExpandedIdx(new Set())
    } catch (error) {
      console.error('Analyse failed:', error)
      setAnalyseError(String(error))
    } finally {
      setAnalysing(false)
    }
  }

  function toggleSelected(i: number) {
    const next = new Set(selectedIdx)
    next.has(i) ? next.delete(i) : next.add(i)
    setSelectedIdx(next)
  }

  function toggleExpanded(i: number) {
    const next = new Set(expandedIdx)
    next.has(i) ? next.delete(i) : next.add(i)
    setExpandedIdx(next)
  }

  // Accepts through the same POST /api/error-patterns the manual form uses,
  // so suggested and hand-written patterns get identical validation.
  // source: 'auto_detected' is what makes the Auto-Detected stat meaningful.
  async function handleAcceptSelected() {
    if (!candidates || selectedIdx.size === 0) return
    setAccepting(true)
    let ok = 0

    try {
      for (const i of Array.from(selectedIdx).sort((a, b) => a - b)) {
        const c = candidates[i]
        const res = await fetch('/api/error-patterns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botId: selectedBotId,
            name: c.suggestedName,
            description: c.description,
            severity: c.severity,
            errorType: c.errorType,
            stage: c.stage,
            detectionMethod: c.detectionMethod,
            detectionConfig: c.detectionConfig,
            source: 'auto_detected'
          })
        })
        if (res.ok) ok++
      }

      setAcceptedCount(ok)
      // Drop accepted rows from the list so the screen reflects what's left
      setCandidates(candidates.filter((_, i) => !selectedIdx.has(i)))
      setSelectedIdx(new Set())
      fetchPatterns()
    } catch (error) {
      console.error('Accept failed:', error)
    } finally {
      setAccepting(false)
    }
  }

  function handleRejectSelected() {
    if (!candidates) return
    setCandidates(candidates.filter((_, i) => !selectedIdx.has(i)))
    setSelectedIdx(new Set())
  }

  function buildConfig(): DetectionConfig {
    if (form.detectionMethod === 'keyword') {
      return { target: form.target, mode: form.mode, phrases: form.phrases.split('\n').map(p => p.trim()).filter(Boolean) }
    }
    if (form.detectionMethod === 'regex') {
      return { target: form.target, pattern: form.pattern, should_match: form.shouldMatch }
    }
    return { check: form.check, threshold: form.threshold }
  }

  function loadFormFromPattern(p: ErrorPattern) {
    const config: DetectionConfig = JSON.parse(p.detection_config)
    setForm({
      name: p.name, description: p.description, severity: p.severity,
      errorType: p.error_type, stage: p.stage, detectionMethod: p.detection_method,
      target: config.target || 'bot', mode: config.mode || 'contains',
      phrases: (config.phrases || []).join('\n'), pattern: config.pattern || '',
      shouldMatch: config.should_match !== false, check: config.check || 'repeat_count',
      threshold: config.threshold || 3
    })
  }

  async function handleSave() {
    if (!form.name.trim() || !selectedBotId) return
    setSaving(true)

    try {
      const payload = {
        botId: selectedBotId, name: form.name, description: form.description,
        severity: form.severity, errorType: form.errorType, stage: form.stage,
        detectionMethod: form.detectionMethod, detectionConfig: buildConfig(), source: 'manual'
      }

      if (editingId) {
        await fetch(`/api/error-patterns/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      } else {
        await fetch('/api/error-patterns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      }

      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      fetchPatterns()
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(p: ErrorPattern) {
    await fetch(`/api/error-patterns/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }) })
    fetchPatterns()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this error pattern? This cannot be undone.')) return
    await fetch(`/api/error-patterns/${id}`, { method: 'DELETE' })
    fetchPatterns()
  }

  const filtered = patterns
    .filter(p => !filterSeverity || p.severity === filterSeverity)
    .filter(p => !filterType || p.error_type === filterType)
    .filter(p => !filterStage || p.stage === filterStage)
    .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.description.toLowerCase().includes(searchQuery.toLowerCase()))

  const stats = {
    total: patterns.length,
    active: patterns.filter(p => p.active).length,
    critical: patterns.filter(p => p.severity === 'critical').length,
    autoDetected: patterns.filter(p => p.source === 'auto_detected').length
  }

  if (loading) {
    return (
      <main className="app-shell">
        <Sidebar />
        <section className="main-content">
          <header className="topbar">
            <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Error KB</strong></div>
            <div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={17} /></button><button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div>
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
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Error KB</strong></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={17} /></button><button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div>
        </header>
        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Bug size={14} /> Error Knowledge Base</div>
              <h1>Error Patterns</h1>
              <p>Define, track, and auto-detect bot error patterns. These rules feed into eval grading.</p>
            </div>
            {tab === 'patterns' && (
              <button className="btn-primary" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()) }}>
                <Plus size={15} /> Add Error Pattern
              </button>
            )}
          </div>

          <div className="form-row-full" style={{ marginBottom: 16 }}>
            <label>
              Bot
              <select value={selectedBotId} onChange={(e) => setSelectedBotId(e.target.value)}>
                <option value="">Select a bot</option>
                {bots.map(bot => <option key={bot.id} value={bot.id}>{bot.name} ({bot.department})</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>

          {/* Tabs */}
          <div className="kb-tabs">
            <button className={tab === 'patterns' ? 'active' : ''} onClick={() => setTab('patterns')}>
              <ListChecks size={15} /> Patterns
              <span className="kb-tab-count">{patterns.length}</span>
            </button>
            <button className={tab === 'suggestions' ? 'active' : ''} onClick={() => setTab('suggestions')}>
              <Zap size={15} /> Suggestions
              {candidates && candidates.length > 0 && <span className="kb-tab-count">{candidates.length}</span>}
            </button>
          </div>

          {/* Stats */}
          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card"><div className="stat-icon blue"><BookOpen size={18} /></div><div><div className="stat-label">Total Patterns</div><div className="stat-value">{stats.total}</div></div></div>
            <div className="stat-card"><div className="stat-icon green"><Shield size={18} /></div><div><div className="stat-label">Active</div><div className="stat-value">{stats.active}</div></div></div>
            <div className="stat-card"><div className="stat-icon red"><AlertOctagon size={18} /></div><div><div className="stat-label">Critical</div><div className="stat-value">{stats.critical}</div></div></div>
            <div className="stat-card"><div className="stat-icon amber"><Zap size={18} /></div><div><div className="stat-label">Auto-Detected</div><div className="stat-value">{stats.autoDetected}</div></div></div>
          </div>

          {tab === 'patterns' && (<>
          {/* Filters */}
          <div className="filter-bar">
            <div className="search-wrap">
              <Search size={14} />
              <input placeholder="Search error patterns..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
              <option value="">All severities</option>
              {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">All types</option>
              {ERROR_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <select value={filterStage} onChange={e => setFilterStage(e.target.value)}>
              <option value="">All stages</option>
              {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            {(filterSeverity || filterType || filterStage || searchQuery) && (
              <button className="btn-ghost" onClick={() => { setFilterSeverity(''); setFilterType(''); setFilterStage(''); setSearchQuery('') }}>
                <X size={14} /> Clear
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {showForm && (
            <div className="kb-form-card">
              <div className="kb-form-header">
                <h3>{editingId ? 'Edit' : 'New'} Error Pattern</h3>
                <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }}><X size={16} /></button>
              </div>
              <div className="kb-form-grid">
                <div className="kb-form-field full">
                  <label>Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Transfer loop timeout" />
                </div>
                <div className="kb-form-field full">
                  <label>Description</label>
                  <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What this error looks like and when it happens" rows={2} />
                </div>
                <div className="kb-form-field">
                  <label>Severity</label>
                  <select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="kb-form-field">
                  <label>Error Type</label>
                  <select value={form.errorType} onChange={e => setForm({ ...form, errorType: e.target.value })}>
                    {ERROR_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="kb-form-field">
                  <label>Call Stage</label>
                  <select value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
                    {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="kb-form-field">
                  <label>Detection Method</label>
                  <select value={form.detectionMethod} onChange={e => setForm({ ...form, detectionMethod: e.target.value })}>
                    {DETECTION_METHOD_OPTIONS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                  </select>
                </div>

                {form.detectionMethod === 'keyword' && (
                  <>
                    <div className="kb-form-field">
                      <label>Check in</label>
                      <select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                        <option value="bot">Bot speech</option>
                        <option value="caller">Caller speech</option>
                        <option value="both">Both</option>
                      </select>
                    </div>
                    <div className="kb-form-field">
                      <label>Mode</label>
                      <select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                        <option value="contains">Must contain (any)</option>
                        <option value="not_contains">Must NOT contain</option>
                        <option value="contains_all">Must contain (all)</option>
                      </select>
                    </div>
                    <div className="kb-form-field full">
                      <label>Phrases (one per line)</label>
                      <textarea value={form.phrases} onChange={e => setForm({ ...form, phrases: e.target.value })} placeholder={'e.g.\nI apologize for the delay\nstill working on transferring'} rows={4} />
                    </div>
                  </>
                )}

                {form.detectionMethod === 'regex' && (
                  <>
                    <div className="kb-form-field">
                      <label>Check in</label>
                      <select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                        <option value="bot">Bot speech</option>
                        <option value="caller">Caller speech</option>
                      </select>
                    </div>
                    <div className="kb-form-field">
                      <label>Should match?</label>
                      <select value={form.shouldMatch ? 'yes' : 'no'} onChange={e => setForm({ ...form, shouldMatch: e.target.value === 'yes' })}>
                        <option value="yes">Error if matches</option>
                        <option value="no">Error if NOT matches</option>
                      </select>
                    </div>
                    <div className="kb-form-field full">
                      <label>Regex pattern</label>
                      <input value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} placeholder="e.g. \b(\d{10})\b.*\b\1\b" style={{ fontFamily: 'monospace' }} />
                    </div>
                  </>
                )}

                {form.detectionMethod === 'behavioral' && (
                  <>
                    <div className="kb-form-field">
                      <label>Behavioral check</label>
                      <select value={form.check} onChange={e => setForm({ ...form, check: e.target.value })}>
                        <option value="repeat_count">Repeated message count</option>
                        <option value="transfer_loop">Transfer loop duration</option>
                        <option value="silence_count">Silence / no-input count</option>
                        <option value="max_turns">Max conversation turns</option>
                        <option value="consecutive_misunderstand">Consecutive misunderstandings</option>
                      </select>
                    </div>
                    <div className="kb-form-field">
                      <label>Threshold</label>
                      <input type="number" value={form.threshold} onChange={e => setForm({ ...form, threshold: parseInt(e.target.value) || 0 })} min={1} />
                    </div>
                  </>
                )}
              </div>
              <div className="kb-form-actions">
                <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null) }}>Cancel</button>
                <button className="btn-primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                  {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {editingId ? 'Update' : 'Create'}</>}
                </button>
              </div>
            </div>
          )}

          {/* Pattern List */}
          <div className="kb-list">
            {filtered.length === 0 ? (
              <div className="kb-empty">
                <Bug size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p>{patterns.length === 0 ? 'No error patterns yet. Click "Add Error Pattern" to get started.' : 'No patterns match your filters.'}</p>
              </div>
            ) : (
              filtered.map(p => {
                const config: DetectionConfig = JSON.parse(p.detection_config)
                const SevIcon = SEVERITY_ICONS[p.severity] || Info
                return (
                  <div key={p.id} className={`kb-card ${!p.active ? 'kb-card-disabled' : ''}`}>
                    <div className="kb-card-header">
                      <div className="kb-card-title-row">
                        <span className="kb-severity-badge" style={{ background: SEVERITY_COLORS[p.severity] + '20', color: SEVERITY_COLORS[p.severity] }}>
                          <SevIcon size={12} /> {p.severity}
                        </span>
                        <span className="kb-type-badge">{p.error_type.replace('_', ' ')}</span>
                        <span className="kb-stage-badge">{p.stage}</span>
                        {p.source === 'auto_detected' && <span className="kb-auto-badge"><Zap size={10} /> Auto</span>}
                      </div>
                      <div className="kb-card-actions">
                        <button className="icon-button" title={p.active ? 'Disable' : 'Enable'} onClick={() => handleToggle(p)}>
                          {p.active ? <ToggleRight size={18} style={{ color: '#22C55E' }} /> : <ToggleLeft size={18} style={{ color: '#64748B' }} />}
                        </button>
                        <button className="icon-button" title="Edit" onClick={() => { setEditingId(p.id); loadFormFromPattern(p); setShowForm(true) }}>
                          <Pencil size={14} />
                        </button>
                        <button className="icon-button" title="Delete" onClick={() => handleDelete(p.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <h4 className="kb-card-name">{p.name}</h4>
                    {p.description && <p className="kb-card-desc">{p.description}</p>}
                    <div className="kb-card-meta">
                      <span className="kb-method-tag">{p.detection_method}</span>
                      {p.detection_method === 'keyword' && config.phrases && (
                        <span className="kb-detail">Checks {config.target} for {config.mode === 'not_contains' ? 'absence of' : ''} {config.phrases.length} phrase{config.phrases.length !== 1 ? 's' : ''}</span>
                      )}
                      {p.detection_method === 'behavioral' && (
                        <span className="kb-detail">{config.check?.replace('_', ' ')} ≥ {config.threshold}</span>
                      )}
                      {p.detection_method === 'regex' && (
                        <span className="kb-detail" style={{ fontFamily: 'monospace', fontSize: 11 }}>{config.pattern?.substring(0, 40)}</span>
                      )}
                      {p.times_triggered > 0 && <span className="kb-triggered">Triggered {p.times_triggered}x</span>}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          </>)}

          {tab === 'suggestions' && (
            <div className="kb-suggest">
              <div className="kb-suggest-intro">
                <h3><FileSearch size={17} /> Analyse transcripts for new error patterns</h3>
                <p>
                  Upload call transcripts and the analyser proposes error patterns with detection
                  rules already filled in. Review the evidence, tick the ones that look right, and
                  they go straight into the KB. Nothing is added until you accept it.
                </p>
              </div>

              <div className="kb-upload-row">
                <input
                  type="file"
                  accept=".txt,.pdf"
                  onChange={handleSuggestionFileUpload}
                  id="suggest-file"
                  style={{ display: 'none' }}
                />
                <label htmlFor="suggest-file" className="kb-upload-box">
                  <Upload size={26} />
                  <div>
                    <strong>Upload transcripts</strong>
                    <p>.pdf or .txt — multiple calls detected automatically</p>
                  </div>
                </label>

                {uploadedFile && (
                  <div className="kb-uploaded">
                    <FileText size={15} />
                    <span>{uploadedFile.name}</span>
                    <button onClick={() => { setUploadedFile(null); setTranscriptText(''); setCandidates(null) }}>&times;</button>
                  </div>
                )}

                <textarea
                  className="kb-paste"
                  value={transcriptText}
                  onChange={e => setTranscriptText(e.target.value)}
                  placeholder="...or paste transcripts here"
                  rows={5}
                />

                <button
                  className="btn-primary"
                  onClick={handleAnalyse}
                  disabled={analysing || !transcriptText.trim() || !selectedBotId}
                >
                  {analysing ? <><Loader2 size={14} className="animate-spin" /> Analysing...</> : <><Zap size={14} /> Analyse</>}
                </button>
              </div>

              {analyseError && (
                <div className="kb-analyse-error"><AlertTriangle size={15} /> {analyseError}</div>
              )}

              {acceptedCount !== null && (
                <div className="kb-accepted-note">
                  <Check size={15} /> Added {acceptedCount} pattern{acceptedCount !== 1 ? 's' : ''} to the KB. They apply from the next eval run.
                </div>
              )}

              {candidates && (
                <div className="kb-candidates">
                  <div className="kb-candidates-head">
                    <div>
                      <strong>{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</strong>
                      <span> from {callsAnalysed} call{callsAnalysed !== 1 ? 's' : ''}</span>
                    </div>
                    {candidates.length > 0 && (
                      <div className="kb-candidates-actions">
                        <button className="btn-ghost" onClick={() => setSelectedIdx(new Set(candidates.map((_, i) => i)))}>
                          <CheckCheck size={14} /> Select all
                        </button>
                        <button className="btn-ghost" onClick={handleRejectSelected} disabled={selectedIdx.size === 0}>
                          <X size={14} /> Reject selected
                        </button>
                        <button className="btn-primary" onClick={handleAcceptSelected} disabled={accepting || selectedIdx.size === 0}>
                          {accepting
                            ? <><Loader2 size={14} className="animate-spin" /> Adding...</>
                            : <><Plus size={14} /> Add {selectedIdx.size || ''} to KB</>}
                        </button>
                      </div>
                    )}
                  </div>

                  {candidates.length === 0 ? (
                    <div className="kb-empty">
                      <Zap size={30} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <p>No new patterns found. Either the transcripts are clean or your existing patterns already cover what's there.</p>
                    </div>
                  ) : (
                    candidates.map((c, i) => {
                      const SevIcon = SEVERITY_ICONS[c.severity] || Info
                      const isSelected = selectedIdx.has(i)
                      const isOpen = expandedIdx.has(i)
                      return (
                        <div key={i} className={`kb-cand ${isSelected ? 'kb-cand-selected' : ''}`}>
                          <div className="kb-cand-main">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelected(i)}
                              className="kb-cand-check"
                            />
                            <div className="kb-cand-body">
                              <div className="kb-card-title-row">
                                <span className="kb-severity-badge" style={{ background: SEVERITY_COLORS[c.severity] + '20', color: SEVERITY_COLORS[c.severity] }}>
                                  <SevIcon size={12} /> {c.severity}
                                </span>
                                <span className="kb-type-badge">{c.errorType.replace('_', ' ')}</span>
                                <span className="kb-stage-badge">{c.stage}</span>
                                <span className="kb-conf-badge" style={{ background: CONFIDENCE_COLORS[c.confidence] + '20', color: CONFIDENCE_COLORS[c.confidence] }}>
                                  {c.confidence} confidence
                                </span>
                                <span className="kb-cand-count">{c.callCount} call{c.callCount !== 1 ? 's' : ''}</span>
                              </div>
                              <h4 className="kb-card-name">{c.suggestedName}</h4>
                              <p className="kb-card-desc">{c.description}</p>
                              <p className="kb-cand-rationale">{c.rationale}</p>
                              <div className="kb-card-meta">
                                <span className="kb-method-tag">{c.detectionMethod}</span>
                                <span className="kb-detail" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                  {JSON.stringify(c.detectionConfig)}
                                </span>
                              </div>
                              <button className="kb-cand-toggle" onClick={() => toggleExpanded(i)}>
                                {isOpen ? <EyeOff size={13} /> : <Eye size={13} />}
                                {isOpen ? 'Hide' : 'Show'} evidence ({c.evidence.length})
                              </button>
                              {isOpen && (
                                <div className="kb-cand-evidence">
                                  {c.evidence.map((e, j) => (
                                    <div key={j} className="kb-ev-row">
                                      <span className="kb-ev-call">Call {e.callNumber}</span>
                                      <span className="kb-ev-text">{e.excerpt}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

/* ---- styles injected at module level ---- */
const styles = `
:root { --ink: #F8FAFC; --muted-ink: #94A3B8; --line: #334155; --surface: #1E293B; --wash: #0F172A; --navy: #F59E0B; --blue: #94A3B8; --mint: #334155; --amber: #F59E0B; --purple: #334155; --danger: #EF4444; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--wash); color: var(--ink); font-family: var(--geist), Arial, sans-serif; }
button, select, textarea { font: inherit; }
button { cursor: pointer; }
.app-shell { min-height: 100vh; display: flex; background: var(--wash); }
.sidebar { width: 228px; flex: 0 0 228px; background: var(--surface); border-right: 1px solid var(--line); padding: 25px 14px 17px; display: flex; flex-direction: column; min-height: 100vh; }
.brand { display: flex; align-items: center; gap: 9px; font-size: 19px; font-weight: 750; letter-spacing: -0.04em; padding: 0 12px 28px; color: #214b50; }.brand-mark { display: grid; place-items: center; width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 9px; }.brand-dot { color: #c89b59; }.workspace-label, .nav-section { color: #8a969e; text-transform: uppercase; letter-spacing: .1em; font-size: 9px; font-weight: 700; padding: 0 12px 8px; }.workspace-select { display: flex; align-items: center; gap: 8px; border: 0; background: transparent; color: #405464; width: 100%; padding: 7px 10px 21px; text-align: left; }.workspace-select svg { margin-left: auto; color: #93a1aa; }.workspace-icon { display: grid; place-items: center; width: 25px; height: 25px; background: #d9eee9; color: #21685d; border-radius: 7px; font-weight: 800; font-size: 12px; }.workspace-name { font-weight: 650; font-size: 12px; }.nav-list { display: flex; flex-direction: column; gap: 3px; }.nav-section.second { margin-top: 23px; }.nav-item { display: flex; gap: 11px; align-items: center; color: #697984; text-decoration: none; font-size: 12px; font-weight: 590; border-radius: 8px; padding: 10px 12px; }.nav-item:hover { background: #dfece9; color: #2d5f73; }.nav-item.active { background: #d6e8e3; color: #19536b; font-weight: 700; }.sidebar-bottom { margin-top: auto; }.help-card { display: flex; gap: 9px; align-items: center; margin: 0 4px 18px; border: 1px solid #dce7e8; background: #1E293B; padding: 10px; border-radius: 9px; color: #486875; }.help-card strong { font-size: 11px; display: block; }.help-card p { font-size: 10px; margin: 3px 0 0; color: #83949c; }.help-icon { width: 25px; height: 25px; display: grid; place-items: center; color: #367d85; background: #e2f2ee; border-radius: 7px; }.help-card > svg { margin-left: auto; }.profile { display: flex; align-items: center; gap: 9px; border-top: 1px solid #dce7e8; padding-top: 18px; }.avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }.profile-text { flex: 1; }.profile-text strong { font-size: 11px; display: block; color: #214b50; }.profile-text span { font-size: 10px; color: #83949c; }
.main-content { flex: 1; padding: 0; display: flex; flex-direction: column; }
.topbar { background: #1E293B; border-bottom: 1px solid #334155; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94A3B8; }.breadcrumb strong { color: #F8FAFC; }
.top-actions { display: flex; align-items: center; gap: 12px; }
.icon-button { background: transparent; border: none; color: #94A3B8; padding: 8px; border-radius: 8px; cursor: pointer; }.icon-button:hover { background: #334155; color: #F8FAFC; }
.top-avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.page-wrap { padding: 32px; flex: 1; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #8a969e; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #214b50; }
.page-heading p { margin: 0; color: #697984; font-size: 14px; }
.form-row-full { margin-bottom: 20px; }
.form-row-full label { display: block; font-size: 12px; font-weight: 600; color: #697984; }
.form-row-full label select { width: 100%; padding: 12px; background: #1E293B; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; font-size: 14px; margin-top: 8px; appearance: none; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; }
.stat-card { display: flex; align-items: center; gap: 16px; padding: 20px; background: #1E293B; border: 1px solid #334155; border-radius: 12px; }
.stat-icon { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 8px; }
.stat-icon.blue { background: #3b82f6; color: white; }
.stat-icon.green { background: #22c55e; color: white; }
.stat-icon.red { background: #ef4444; color: white; }
.stat-icon.amber { background: #f59e0b; color: white; }
.stat-label { font-size: 12px; color: #94A3B8; }
.stat-value { font-size: 24px; font-weight: 700; color: #F8FAFC; }
.flex { display: flex; }.items-center { align-items: center; }.justify-center { justify-content: center; }.py-20 { padding-top: 80px; padding-bottom: 80px; }.ml-2 { margin-left: 8px; }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.topbar { background: #1E293B; border-bottom-color: #334155; }
.main-content, .page-wrap { background: #0F172A; }
.brand, .page-heading h1 { color: #F8FAFC; }
.nav-item { color: #94A3B8; }.nav-item:hover, .nav-item.active { background: #334155; color: #F8FAFC; }
.stat-card { background: #1E293B; border-color: #334155; }
.help-card { background: #1E293B; border-color: #334155; }
.filter-bar { display: flex; gap: 8px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.filter-bar select { background: #1E293B; border: 1px solid #334155; border-radius: 8px; color: #F8FAFC; padding: 7px 10px; font-size: 13px; }
.search-wrap { display: flex; align-items: center; gap: 6px; background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 7px 10px; flex: 1; min-width: 180px; }
.search-wrap input { background: transparent; border: none; color: #F8FAFC; outline: none; font-size: 13px; width: 100%; }
.search-wrap svg { color: #64748B; flex-shrink: 0; }
.btn-ghost { background: none; border: 1px solid #334155; color: #94A3B8; border-radius: 8px; padding: 7px 12px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 5px; }
.btn-ghost:hover { border-color: #475569; color: #F8FAFC; }
.btn-primary { background: #3B82F6; color: white; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.btn-primary:hover { background: #2563EB; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* Form card */
.kb-form-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.kb-form-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.kb-form-header h3 { font-size: 15px; font-weight: 600; color: #F8FAFC; margin: 0; }
.kb-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.kb-form-field { display: flex; flex-direction: column; gap: 4px; }
.kb-form-field.full { grid-column: 1 / -1; }
.kb-form-field label { font-size: 12px; color: #94A3B8; font-weight: 500; }
.kb-form-field input, .kb-form-field textarea, .kb-form-field select { background: #0F172A; border: 1px solid #334155; border-radius: 8px; color: #F8FAFC; padding: 8px 10px; font-size: 13px; }
.kb-form-field textarea { resize: vertical; font-family: inherit; }
.kb-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid #334155; }

/* Pattern cards */
.kb-list { display: flex; flex-direction: column; gap: 10px; }
.kb-card { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; transition: border-color 0.15s; }
.kb-card:hover { border-color: #475569; }
.kb-card-disabled { opacity: 0.5; }
.kb-card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
.kb-card-title-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.kb-card-actions { display: flex; gap: 2px; }
.kb-severity-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.kb-type-badge, .kb-stage-badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: #334155; color: #CBD5E1; }
.kb-auto-badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: #422006; color: #FBBF24; display: flex; align-items: center; gap: 3px; }
.kb-card-name { font-size: 14px; font-weight: 600; color: #F8FAFC; margin: 0 0 4px 0; }
.kb-card-desc { font-size: 13px; color: #94A3B8; margin: 0 0 10px 0; line-height: 1.4; }
.kb-card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.kb-method-tag { font-size: 11px; padding: 2px 7px; border-radius: 4px; background: #1E3A5F; color: #60A5FA; font-weight: 500; }
.kb-detail { font-size: 12px; color: #64748B; }
.kb-triggered { font-size: 11px; color: #F59E0B; font-weight: 500; }
.kb-empty { text-align: center; padding: 48px; color: #64748B; }
.kb-empty p { margin: 0; font-size: 14px; }

/* Responsive */
@media (max-width: 640px) {
  .kb-form-grid { grid-template-columns: 1fr; }
  .filter-bar { flex-direction: column; }
}

/* ---- Suggestions tab ---- */
.kb-tabs { display: flex; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid #334155; }
.kb-tabs button { display: flex; align-items: center; gap: 7px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #94A3B8; padding: 10px 14px; font-size: 13px; font-weight: 600; }
.kb-tabs button:hover { color: #F8FAFC; }
.kb-tabs button.active { color: #F59E0B; border-bottom-color: #F59E0B; }
.kb-tab-count { background: #334155; color: #F8FAFC; border-radius: 10px; padding: 1px 7px; font-size: 10px; font-weight: 700; }
.kb-suggest { display: flex; flex-direction: column; gap: 18px; }
.kb-suggest-intro h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 15px; color: #F8FAFC; }
.kb-suggest-intro p { margin: 0; font-size: 13px; color: #94A3B8; max-width: 760px; line-height: 1.55; }
.kb-upload-row { display: flex; flex-direction: column; gap: 12px; background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
.kb-upload-box { display: flex; align-items: center; gap: 14px; padding: 18px; background: #0F172A; border: 2px dashed #475569; border-radius: 9px; color: #94A3B8; cursor: pointer; }
.kb-upload-box:hover { border-color: #F59E0B; color: #F8FAFC; }
.kb-upload-box strong { display: block; font-size: 14px; color: #F8FAFC; }
.kb-upload-box p { margin: 3px 0 0; font-size: 12px; }
.kb-uploaded { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: #0F172A; border: 1px solid #475569; border-radius: 7px; font-size: 13px; color: #F8FAFC; }
.kb-uploaded span { flex: 1; }
.kb-uploaded button { background: transparent; border: none; color: #94A3B8; font-size: 17px; }
.kb-uploaded button:hover { color: #EF4444; }
.kb-paste { width: 100%; padding: 11px; background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; font-family: monospace; font-size: 12px; resize: vertical; }
.kb-analyse-error { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #EF444418; border: 1px solid #EF4444; border-radius: 8px; color: #EF4444; font-size: 13px; }
.kb-accepted-note { display: flex; align-items: center; gap: 8px; padding: 12px 14px; background: #22C55E18; border: 1px solid #22C55E; border-radius: 8px; color: #22C55E; font-size: 13px; }
.kb-candidates { display: flex; flex-direction: column; gap: 10px; }
.kb-candidates-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-bottom: 4px; }
.kb-candidates-head strong { font-size: 14px; color: #F8FAFC; }
.kb-candidates-head span { font-size: 13px; color: #94A3B8; }
.kb-candidates-actions { display: flex; align-items: center; gap: 8px; }
.kb-cand { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
.kb-cand-selected { border-color: #F59E0B; background: #1E293B; }
.kb-cand-main { display: flex; gap: 13px; align-items: flex-start; }
.kb-cand-check { width: 17px; height: 17px; margin-top: 3px; accent-color: #F59E0B; cursor: pointer; flex: 0 0 auto; }
.kb-cand-body { flex: 1; min-width: 0; }
.kb-conf-badge { border-radius: 5px; padding: 2px 7px; font-size: 10px; font-weight: 700; text-transform: capitalize; }
.kb-cand-count { font-size: 11px; color: #94A3B8; font-weight: 600; }
.kb-cand-rationale { margin: 6px 0 10px; font-size: 12px; color: #94A3B8; line-height: 1.5; font-style: italic; }
.kb-cand-toggle { display: flex; align-items: center; gap: 6px; margin-top: 10px; background: transparent; border: none; color: #F59E0B; font-size: 12px; font-weight: 600; padding: 0; }
.kb-cand-evidence { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; border-left: 2px solid #334155; padding-left: 12px; }
.kb-ev-row { display: flex; gap: 10px; font-size: 12px; }
.kb-ev-call { flex: 0 0 auto; color: #F59E0B; font-weight: 700; }
.kb-ev-text { color: #CBD5E1; line-height: 1.5; word-break: break-word; }
`

if (typeof document !== 'undefined' && !document.getElementById('error-kb-styles')) {
  const style = document.createElement('style')
  style.id = 'error-kb-styles'
  style.textContent = styles
  document.head.appendChild(style)
}
