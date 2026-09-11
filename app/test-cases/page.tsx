'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ArrowRight, Search, CircleHelp, MoreHorizontal, AudioLines, LayoutDashboard, FlaskConical, ClipboardCheck, Sparkles, MessageSquareText, Headphones, Settings2, Users, Plus, Pencil, Trash2, X, Save, Loader2, Bug, ListChecks, Zap, Upload, FileText, Eye, EyeOff, AlertTriangle, Check, FileSearch, BookOpen, Shield, Flag, Wrench, FileJson, CheckCircle2, XCircle } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot {
  id: string
  name: string
  department: string
}

interface TestCaseSpec {
  scenario_type?: string
  priority?: string
  description?: string
  persona?: string
  goal?: string
  contact_uri?: string
  fixture_variant?: string
  caller_turns?: string[]
  expected_tools?: string[]
  must_say?: string[]
  must_not_say?: string[]
  expect_terminal_state?: boolean
}

interface TestCase {
  id: string
  bot_id: string
  spec: TestCaseSpec
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

interface Evidence {
  callNumber: number
  excerpt: string
}

interface TestCaseCandidate {
  kind: 'test_case'
  suggestedScenario: string
  description: string
  callCount: number
  confidence: 'high' | 'medium' | 'low'
  rationale: string
  evidence: Evidence[]
}

const PRIORITY_OPTIONS = ['P0', 'P1', 'P2', 'P3']
const PRIORITY_COLORS: Record<string, string> = { P0: '#EF4444', P1: '#F59E0B', P2: '#3B82F6', P3: '#94A3B8' }
const CONFIDENCE_COLORS: Record<string, string> = { high: '#22C55E', medium: '#F59E0B', low: '#94A3B8' }

const emptyForm = () => ({
  id: '',
  scenarioType: '',
  priority: 'P2',
  description: '',
  persona: '',
  goal: '',
  contactUri: '',
  fixtureVariant: '',
  callerTurns: '',
  expectedTools: '',
  mustSay: '',
  mustNotSay: '',
  expectTerminalState: false
})

export default function TestCasesPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'cases' | 'suggestions' | 'import'>('cases')

  // Bulk import
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ id: string; ok: boolean; message: string }[] | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // Suggestions
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [transcriptText, setTranscriptText] = useState('')
  const [analysing, setAnalysing] = useState(false)
  const [candidates, setCandidates] = useState<TestCaseCandidate[] | null>(null)
  const [callsAnalysed, setCallsAnalysed] = useState(0)
  const [expandedCand, setExpandedCand] = useState<Set<number>>(new Set())
  const [analyseError, setAnalyseError] = useState<string | null>(null)

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
    if (selectedBotId) fetchTestCases()
  }, [selectedBotId])


  // Bulk import: paste a JSON array of specs. Each row goes through the same
  // POST /api/test-cases the manual form uses, so validation is identical and
  // one bad entry doesn't take the rest down with it.
  const IMPORT_TEMPLATE = `[
  {
    "scenario_type": "flow_name_here",
    "priority": "P1",
    "description": "What this scenario is and what the bot must do",
    "persona": "Who is calling",
    "goal": "What they want",
    "caller_turns": ["Hello", "I need X"],
    "must_say": ["required phrase"],
    "must_not_say": ["forbidden phrase"],
    "expected_tools": [],
    "expect_terminal_state": false
  }
]`

  async function handleBulkImport() {
    if (!importText.trim() || !selectedBotId) return

    setImportError(null)
    setImportResults(null)

    let parsed: any
    try {
      parsed = JSON.parse(importText)
    } catch (e) {
      setImportError(`That isn't valid JSON: ${e instanceof Error ? e.message : String(e)}`)
      return
    }

    if (!Array.isArray(parsed)) {
      setImportError('Expected a JSON array of test case objects, even for a single one.')
      return
    }
    if (parsed.length === 0) {
      setImportError('The array is empty.')
      return
    }

    const missing = parsed
      .map((s: any, i: number) => (!s || !s.scenario_type ? i + 1 : null))
      .filter((x): x is number => x !== null)
    if (missing.length > 0) {
      setImportError(`Entries ${missing.join(', ')} have no scenario_type. Nothing was imported.`)
      return
    }

    setImporting(true)
    const results: { id: string; ok: boolean; message: string }[] = []
    const selectedBot = bots.find(b => b.id === selectedBotId)

    try {
      for (const spec of parsed) {
        const label = spec.id || spec.scenario_type
        try {
          const res = await fetch('/api/test-cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: spec.id || undefined,
              botId: selectedBotId,
              botName: selectedBot?.name,
              spec
            })
          })
          const json = await res.json()
          results.push(
            json.success
              ? { id: json.id, ok: true, message: `${spec.scenario_type}` }
              : { id: label, ok: false, message: json.error || 'Failed' }
          )
        } catch (e) {
          results.push({ id: label, ok: false, message: String(e) })
        }
      }

      setImportResults(results)
      if (results.some(r => r.ok)) {
        setImportText('')
        fetchTestCases()
      }
    } finally {
      setImporting(false)
    }
  }

  async function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      setImportText((await file.text()).trim())
      setImportError(null)
      setImportResults(null)
    } catch (e) {
      setImportError(`Couldn't read ${file.name}`)
    } finally {
      event.target.value = ''
    }
  }

  async function fetchTestCases() {
    try {
      const res = await fetch(`/api/test-cases?botId=${encodeURIComponent(selectedBotId)}`)
      if (res.ok) {
        const data = await res.json()
        setTestCases(data.testCases || [])
      }
    } catch (e) {
      console.error('Failed to fetch test cases:', e)
    }
  }

  function linesToArray(s: string): string[] {
    return s.split('\n').map(x => x.trim()).filter(Boolean)
  }

  function buildSpec(): TestCaseSpec {
    return {
      scenario_type: form.scenarioType.trim(),
      priority: form.priority,
      description: form.description.trim(),
      persona: form.persona.trim(),
      goal: form.goal.trim(),
      contact_uri: form.contactUri.trim(),
      fixture_variant: form.fixtureVariant.trim(),
      caller_turns: linesToArray(form.callerTurns),
      expected_tools: linesToArray(form.expectedTools),
      must_say: linesToArray(form.mustSay),
      must_not_say: linesToArray(form.mustNotSay),
      expect_terminal_state: form.expectTerminalState
    }
  }

  function loadForm(tc: TestCase) {
    const s = tc.spec || {}
    setForm({
      id: tc.id,
      scenarioType: s.scenario_type || '',
      priority: s.priority || 'P2',
      description: s.description || '',
      persona: s.persona || '',
      goal: s.goal || '',
      contactUri: s.contact_uri || '',
      fixtureVariant: s.fixture_variant || '',
      callerTurns: (s.caller_turns || []).join('\n'),
      expectedTools: (s.expected_tools || []).join('\n'),
      mustSay: (s.must_say || []).join('\n'),
      mustNotSay: (s.must_not_say || []).join('\n'),
      expectTerminalState: !!s.expect_terminal_state
    })
  }

  async function handleSave() {
    if (!form.scenarioType.trim()) {
      setSaveError('Scenario type is required.')
      return
    }
    setSaving(true)
    setSaveError(null)

    try {
      const spec = buildSpec()
      const selectedBot = bots.find(b => b.id === selectedBotId)

      const res = editingId
        ? await fetch(`/api/test-cases/${editingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spec })
          })
        : await fetch('/api/test-cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: form.id.trim() || undefined,
              botId: selectedBotId,
              botName: selectedBot?.name,
              spec
            })
          })

      const json = await res.json()
      if (!json.success) {
        setSaveError(json.error || 'Save failed')
        return
      }

      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      fetchTestCases()
    } catch (e) {
      console.error('Save failed:', e)
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete ${id}? Past eval results referencing it are kept, but will point at a test case that no longer exists.`)) return
    await fetch(`/api/test-cases/${id}`, { method: 'DELETE' })
    fetchTestCases()
  }

  function toggleExpanded(id: string) {
    const next = new Set(expanded)
    next.has(id) ? next.delete(id) : next.add(id)
    setExpanded(next)
  }

  // ---- Suggestions ----

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

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
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
      } catch (e) {
        console.error('PDF upload failed:', e)
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
      setCandidates(json.testCaseCandidates || [])
      setCallsAnalysed(json.callsAnalysed || chunks.length)
      setExpandedCand(new Set())
    } catch (e) {
      console.error('Analyse failed:', e)
      setAnalyseError(String(e))
    } finally {
      setAnalysing(false)
    }
  }

  function toggleCandEvidence(i: number) {
    const next = new Set(expandedCand)
    next.has(i) ? next.delete(i) : next.add(i)
    setExpandedCand(next)
  }

  // A coverage gap is a prompt to write a test case, not a test case.
  // This pre-fills the form with the evidence and leaves the spec to you.
  function draftFromCandidate(c: TestCaseCandidate) {
    setForm({
      ...emptyForm(),
      scenarioType: c.suggestedScenario,
      description: c.description,
      goal: '',
      callerTurns: c.evidence.map(e => `# call ${e.callNumber}: ${e.excerpt}`).join('\n')
    })
    setEditingId(null)
    setSaveError(null)
    setTab('cases')
    setShowForm(true)
  }

  const filtered = testCases
    .filter(tc => !filterPriority || tc.spec?.priority === filterPriority)
    .filter(tc => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      return (
        tc.id.toLowerCase().includes(q) ||
        (tc.spec?.scenario_type || '').toLowerCase().includes(q) ||
        (tc.spec?.description || '').toLowerCase().includes(q) ||
        (tc.spec?.goal || '').toLowerCase().includes(q)
      )
    })

  const stats = {
    total: testCases.length,
    withMustSay: testCases.filter(tc => (tc.spec?.must_say || []).length > 0).length,
    withTools: testCases.filter(tc => (tc.spec?.expected_tools || []).length > 0).length,
    noRules: testCases.filter(tc =>
      (tc.spec?.must_say || []).length === 0 &&
      (tc.spec?.must_not_say || []).length === 0 &&
      (tc.spec?.expected_tools || []).length === 0 &&
      !tc.spec?.expect_terminal_state
    ).length
  }

  if (loading) {
    return (
      <main className="app-shell">
        <Sidebar />
        <section className="main-content">
          <header className="topbar">
            <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Test Cases</strong></div>
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
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Test Cases</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Search"><Search size={17} /></button>
            <button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><ListChecks size={14} /> Test Case Library</div>
              <h1>Test Cases</h1>
              <p>The scenarios each call is graded against. Auto-detect matches a call to one of these, then its rules decide pass or fail.</p>
            </div>
            {tab === 'cases' && (
              <button className="btn-primary" onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm()); setSaveError(null) }}>
                <Plus size={15} /> Add Test Case
              </button>
            )}
          </div>

          <div className="form-row-full" style={{ marginBottom: 16 }}>
            <label>
              Bot
              <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                <option value="">Select a bot</option>
                {bots.map(b => <option key={b.id} value={b.id}>{b.name} ({b.department})</option>)}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>

          <div className="kb-tabs">
            <button className={tab === 'cases' ? 'active' : ''} onClick={() => setTab('cases')}>
              <ListChecks size={15} /> Test Cases
              <span className="kb-tab-count">{testCases.length}</span>
            </button>
            <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>
              <FileJson size={15} /> Bulk import
            </button>
            <button className={tab === 'suggestions' ? 'active' : ''} onClick={() => setTab('suggestions')}>
              <Zap size={15} /> Coverage Gaps
              {candidates && candidates.length > 0 && <span className="kb-tab-count">{candidates.length}</span>}
            </button>
          </div>

          <div className="stat-grid" style={{ marginBottom: 24 }}>
            <div className="stat-card"><div className="stat-icon blue"><BookOpen size={18} /></div><div><div className="stat-label">Total Cases</div><div className="stat-value">{stats.total}</div></div></div>
            <div className="stat-card"><div className="stat-icon green"><Shield size={18} /></div><div><div className="stat-label">With must_say</div><div className="stat-value">{stats.withMustSay}</div></div></div>
            <div className="stat-card"><div className="stat-icon amber"><Wrench size={18} /></div><div><div className="stat-label">With tool checks</div><div className="stat-value">{stats.withTools}</div></div></div>
            <div className="stat-card"><div className="stat-icon red"><AlertTriangle size={18} /></div><div><div className="stat-label">No rules at all</div><div className="stat-value">{stats.noRules}</div></div></div>
          </div>

          {stats.noRules > 0 && tab === 'cases' && (
            <div className="tc-warn">
              <AlertTriangle size={15} />
              <span>
                {stats.noRules} test case{stats.noRules !== 1 ? 's have' : ' has'} no must_say, must_not_say, tool or terminal-state
                checks. Any call matched to {stats.noRules !== 1 ? 'them' : 'it'} passes without being graded on anything.
              </span>
            </div>
          )}

          {tab === 'cases' && (<>
            <div className="filter-bar">
              <div className="search-wrap">
                <Search size={14} />
                <input placeholder="Search id, scenario, goal..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="">All priorities</option>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {(searchQuery || filterPriority) && (
                <button className="btn-ghost" onClick={() => { setSearchQuery(''); setFilterPriority('') }}>
                  <X size={14} /> Clear
                </button>
              )}
            </div>

            {showForm && (
              <div className="kb-form-card">
                <div className="kb-form-header">
                  <h3>{editingId ? `Edit ${editingId}` : 'New Test Case'}</h3>
                  <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); setSaveError(null) }}><X size={16} /></button>
                </div>

                {saveError && <div className="tc-error"><AlertTriangle size={14} /> {saveError}</div>}

                <div className="kb-form-grid">
                  {!editingId && (
                    <div className="kb-form-field">
                      <label>ID (leave blank to auto-assign)</label>
                      <input value={form.id} onChange={e => setForm({ ...form, id: e.target.value })} placeholder="e.g. PEHC-31" />
                    </div>
                  )}
                  <div className="kb-form-field">
                    <label>Priority</label>
                    <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="kb-form-field full">
                    <label>Scenario type</label>
                    <input value={form.scenarioType} onChange={e => setForm({ ...form, scenarioType: e.target.value })} placeholder="e.g. flow3a_jio_happy_path" />
                  </div>
                  <div className="kb-form-field full">
                    <label>Description</label>
                    <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What this scenario is and what the bot must do" />
                  </div>
                  <div className="kb-form-field">
                    <label>Persona</label>
                    <input value={form.persona} onChange={e => setForm({ ...form, persona: e.target.value })} placeholder="e.g. Jio employee, first call" />
                  </div>
                  <div className="kb-form-field">
                    <label>Goal</label>
                    <input value={form.goal} onChange={e => setForm({ ...form, goal: e.target.value })} placeholder="What the caller wants" />
                  </div>
                  <div className="kb-form-field">
                    <label>Contact URI</label>
                    <input value={form.contactUri} onChange={e => setForm({ ...form, contactUri: e.target.value })} placeholder="optional" />
                  </div>
                  <div className="kb-form-field">
                    <label>Fixture variant</label>
                    <input value={form.fixtureVariant} onChange={e => setForm({ ...form, fixtureVariant: e.target.value })} placeholder="optional" />
                  </div>

                  <div className="kb-form-field full">
                    <label>must_say — phrases the bot must use (one per line)</label>
                    <textarea value={form.mustSay} onChange={e => setForm({ ...form, mustSay: e.target.value })} rows={3} placeholder={'whatsapp\n24 hours'} />
                  </div>
                  <div className="kb-form-field full">
                    <label>must_not_say — phrases the bot must avoid (one per line)</label>
                    <textarea value={form.mustNotSay} onChange={e => setForm({ ...form, mustNotSay: e.target.value })} rows={3} placeholder={'medibuddy app or portal'} />
                    <small className="tc-hint">Matching is substring-based, so short entries like &quot;HR&quot; or &quot;app&quot; will also match inside longer words. Prefer whole phrases.</small>
                  </div>
                  <div className="kb-form-field full">
                    <label>expected_tools — in call order (one per line)</label>
                    <textarea value={form.expectedTools} onChange={e => setForm({ ...form, expectedTools: e.target.value })} rows={2} placeholder={'lookup_booking\nraise_ticket'} />
                  </div>
                  <div className="kb-form-field full">
                    <label>caller_turns — scripted caller lines (one per line)</label>
                    <textarea value={form.callerTurns} onChange={e => setForm({ ...form, callerTurns: e.target.value })} rows={4} placeholder="optional" />
                  </div>
                  <div className="kb-form-field">
                    <label>Terminal state</label>
                    <select value={form.expectTerminalState ? 'yes' : 'no'} onChange={e => setForm({ ...form, expectTerminalState: e.target.value === 'yes' })}>
                      <option value="no">Not required</option>
                      <option value="yes">Bot must end the call</option>
                    </select>
                  </div>
                </div>

                <div className="kb-form-actions">
                  <button className="btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); setSaveError(null) }}>Cancel</button>
                  <button className="btn-primary" onClick={handleSave} disabled={saving || !form.scenarioType.trim()}>
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> {editingId ? 'Update' : 'Create'}</>}
                  </button>
                </div>
              </div>
            )}

            <div className="kb-list">
              {filtered.length === 0 ? (
                <div className="kb-empty">
                  <ListChecks size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p>{testCases.length === 0 ? 'No test cases yet.' : 'No test cases match your filters.'}</p>
                </div>
              ) : (
                filtered.map(tc => {
                  const s = tc.spec || {}
                  const isOpen = expanded.has(tc.id)
                  const ruleCount =
                    (s.must_say || []).length +
                    (s.must_not_say || []).length +
                    (s.expected_tools || []).length +
                    (s.expect_terminal_state ? 1 : 0)
                  return (
                    <div key={tc.id} className="kb-card">
                      <div className="kb-card-header">
                        <div className="kb-card-title-row">
                          <span className="tc-id">{tc.id}</span>
                          {s.priority && (
                            <span className="kb-severity-badge" style={{ background: (PRIORITY_COLORS[s.priority] || '#94A3B8') + '20', color: PRIORITY_COLORS[s.priority] || '#94A3B8' }}>
                              <Flag size={11} /> {s.priority}
                            </span>
                          )}
                          <span className="kb-type-badge">{s.scenario_type || 'no scenario_type'}</span>
                          {ruleCount === 0 && <span className="tc-norules">no rules</span>}
                        </div>
                        <div className="kb-card-actions">
                          <button className="icon-button" title="Edit" onClick={() => { setEditingId(tc.id); loadForm(tc); setShowForm(true); setSaveError(null) }}><Pencil size={14} /></button>
                          <button className="icon-button" title="Delete" onClick={() => handleDelete(tc.id)}><Trash2 size={14} /></button>
                        </div>
                      </div>

                      {s.description && <p className="kb-card-desc">{s.description}</p>}

                      <div className="kb-card-meta">
                        {(s.must_say || []).length > 0 && <span className="tc-tag tc-tag-green">{s.must_say!.length} must_say</span>}
                        {(s.must_not_say || []).length > 0 && <span className="tc-tag tc-tag-red">{s.must_not_say!.length} must_not_say</span>}
                        {(s.expected_tools || []).length > 0 && <span className="tc-tag tc-tag-blue">{s.expected_tools!.length} tool{s.expected_tools!.length !== 1 ? 's' : ''}</span>}
                        {s.expect_terminal_state && <span className="tc-tag tc-tag-amber">terminal state</span>}
                        {(s.caller_turns || []).length > 0 && <span className="kb-detail">{s.caller_turns!.length} caller turns</span>}
                      </div>

                      <button className="kb-cand-toggle" onClick={() => toggleExpanded(tc.id)}>
                        {isOpen ? <EyeOff size={13} /> : <Eye size={13} />} {isOpen ? 'Hide' : 'Show'} full spec
                      </button>

                      {isOpen && (
                        <div className="tc-spec">
                          {s.persona && <div className="tc-row"><span>Persona</span><div>{s.persona}</div></div>}
                          {s.goal && <div className="tc-row"><span>Goal</span><div>{s.goal}</div></div>}
                          {(s.must_say || []).length > 0 && (
                            <div className="tc-row"><span>must_say</span><div>{s.must_say!.map((p, i) => <code key={i}>{p}</code>)}</div></div>
                          )}
                          {(s.must_not_say || []).length > 0 && (
                            <div className="tc-row"><span>must_not_say</span><div>{s.must_not_say!.map((p, i) => <code key={i}>{p}</code>)}</div></div>
                          )}
                          {(s.expected_tools || []).length > 0 && (
                            <div className="tc-row"><span>expected_tools</span><div>{s.expected_tools!.map((p, i) => <code key={i}>{p}</code>)}</div></div>
                          )}
                          <div className="tc-row"><span>Terminal state</span><div>{s.expect_terminal_state ? 'Bot must end the call' : 'Not required'}</div></div>
                          {(s.caller_turns || []).length > 0 && (
                            <div className="tc-row"><span>caller_turns</span><div>{s.caller_turns!.map((t, i) => <div key={i} className="tc-turn">{t}</div>)}</div></div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </>)}

          {tab === 'import' && (
            <div className="kb-suggest">
              <div className="kb-suggest-intro">
                <h3><FileJson size={17} /> Import test cases from JSON</h3>
                <p>
                  Paste an array of test case objects — useful when a batch has been drafted elsewhere.
                  Each entry goes through the same validation as the manual form, and entries are
                  imported one by one so a single bad row doesn&apos;t block the rest.
                </p>
              </div>

              <div className="kb-upload-row">
                <div className="ti-head">
                  <span>JSON array</span>
                  <div className="ti-actions">
                    <button className="btn-ghost" onClick={() => setImportText(IMPORT_TEMPLATE)}>
                      Insert template
                    </button>
                    <input type="file" accept=".json,.txt" id="tc-import-file" style={{ display: 'none' }} onChange={handleImportFile} />
                    <label htmlFor="tc-import-file" className="btn-ghost" style={{ cursor: 'pointer' }}>
                      <Upload size={13} /> Load .json
                    </label>
                  </div>
                </div>

                <textarea
                  className="kb-paste"
                  value={importText}
                  onChange={e => { setImportText(e.target.value); setImportError(null) }}
                  rows={16}
                  placeholder='[{"scenario_type": "...", "must_say": ["..."]}]'
                />

                <div className="ti-footer">
                  <span className="tc-hint">
                    <code>id</code> is optional — leave it out and the next PEHC number is assigned.
                    Recognised fields: scenario_type, priority, description, persona, goal,
                    caller_turns, must_say, must_not_say, expected_tools, expect_terminal_state.
                  </span>
                  <button className="btn-primary" onClick={handleBulkImport} disabled={importing || !importText.trim() || !selectedBotId}>
                    {importing ? <><Loader2 size={14} className="animate-spin" /> Importing...</> : <><Plus size={14} /> Import</>}
                  </button>
                </div>
              </div>

              {importError && <div className="tc-error"><AlertTriangle size={15} /> {importError}</div>}

              {importResults && (
                <div className="ti-results">
                  <div className="ti-results-head">
                    <strong>
                      {importResults.filter(r => r.ok).length} imported
                      {importResults.some(r => !r.ok) && `, ${importResults.filter(r => !r.ok).length} failed`}
                    </strong>
                  </div>
                  {importResults.map((r, i) => (
                    <div key={i} className={`ti-row ${r.ok ? 'ti-ok' : 'ti-fail'}`}>
                      {r.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                      <strong>{r.id}</strong>
                      <span>{r.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'suggestions' && (
            <div className="kb-suggest">
              <div className="kb-suggest-intro">
                <h3><FileSearch size={17} /> Find scenarios your test cases don&apos;t cover</h3>
                <p>
                  This clusters callers by what they talk about and flags groups no existing scenario mentions.
                  It finds <em>gaps</em>, not finished test cases — the clusters are keyword-based, so read the
                  excerpts and decide whether each one is really a scenario before drafting it. Naming, goals and
                  expected behaviour stay yours to write.
                </p>
              </div>

              <div className="kb-upload-row">
                <input type="file" accept=".txt,.pdf" onChange={handleFileUpload} id="tc-file" style={{ display: 'none' }} />
                <label htmlFor="tc-file" className="kb-upload-box">
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

                <textarea className="kb-paste" value={transcriptText} onChange={e => setTranscriptText(e.target.value)} placeholder="...or paste transcripts here" rows={5} />

                <button className="btn-primary" onClick={handleAnalyse} disabled={analysing || !transcriptText.trim() || !selectedBotId}>
                  {analysing ? <><Loader2 size={14} className="animate-spin" /> Analysing...</> : <><Zap size={14} /> Find gaps</>}
                </button>
              </div>

              {analyseError && <div className="tc-error"><AlertTriangle size={15} /> {analyseError}</div>}

              {candidates && (
                <div className="kb-candidates">
                  <div className="kb-candidates-head">
                    <div>
                      <strong>{candidates.length} possible gap{candidates.length !== 1 ? 's' : ''}</strong>
                      <span> from {callsAnalysed} call{callsAnalysed !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {candidates.length === 0 ? (
                    <div className="kb-empty">
                      <Check size={30} style={{ opacity: 0.3, marginBottom: 8 }} />
                      <p>No uncovered clusters found. Your existing scenarios already mention everything callers raised.</p>
                    </div>
                  ) : (
                    candidates.map((c, i) => {
                      const isOpen = expandedCand.has(i)
                      return (
                        <div key={i} className="kb-cand">
                          <div className="kb-cand-body">
                            <div className="kb-card-title-row">
                              <span className="kb-conf-badge" style={{ background: CONFIDENCE_COLORS[c.confidence] + '20', color: CONFIDENCE_COLORS[c.confidence] }}>
                                {c.confidence} confidence
                              </span>
                              <span className="kb-cand-count">{c.callCount} call{c.callCount !== 1 ? 's' : ''}</span>
                            </div>
                            <h4 className="kb-card-name">{c.suggestedScenario}</h4>
                            <p className="kb-card-desc">{c.description}</p>
                            <p className="kb-cand-rationale">{c.rationale}</p>
                            <div className="tc-cand-actions">
                              <button className="kb-cand-toggle" onClick={() => toggleCandEvidence(i)}>
                                {isOpen ? <EyeOff size={13} /> : <Eye size={13} />} {isOpen ? 'Hide' : 'Show'} calls ({c.evidence.length})
                              </button>
                              <button className="btn-ghost" onClick={() => draftFromCandidate(c)}>
                                <Plus size={13} /> Draft a test case from this
                              </button>
                            </div>
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

const styles = `
:root { --ink: #F8FAFC; --muted-ink: #94A3B8; --line: #334155; --surface: #1E293B; --wash: #0F172A; --danger: #EF4444; }
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
.main-content { flex: 1; display: flex; flex-direction: column; background: #0F172A; }
.topbar { background: #1E293B; border-bottom: 1px solid #334155; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94A3B8; }
.breadcrumb strong { color: #F8FAFC; }
.top-actions { display: flex; align-items: center; gap: 12px; }
.icon-button { background: transparent; border: none; color: #94A3B8; padding: 7px; border-radius: 7px; }
.icon-button:hover { background: #334155; color: #F8FAFC; }
.top-avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.page-wrap { padding: 32px; flex: 1; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 26px; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #94A3B8; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #F8FAFC; }
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; max-width: 720px; line-height: 1.55; }
.form-row-full label { display: block; font-size: 12px; font-weight: 600; color: #94A3B8; }
.form-row-full select { width: 100%; padding: 12px; background: #1E293B; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; font-size: 14px; margin-top: 8px; appearance: none; }
.btn-primary { background: #F59E0B; color: #0F172A; border: none; padding: 11px 18px; border-radius: 8px; font-weight: 650; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-ghost { background: #334155; color: #F8FAFC; border: 1px solid #475569; padding: 8px 13px; border-radius: 7px; font-size: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.btn-ghost:hover { background: #475569; }
.btn-ghost:disabled { opacity: .45; cursor: not-allowed; }
.kb-tabs { display: flex; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid #334155; }
.kb-tabs button { display: flex; align-items: center; gap: 7px; background: transparent; border: none; border-bottom: 2px solid transparent; color: #94A3B8; padding: 10px 14px; font-size: 13px; font-weight: 600; }
.kb-tabs button:hover { color: #F8FAFC; }
.kb-tabs button.active { color: #F59E0B; border-bottom-color: #F59E0B; }
.kb-tab-count { background: #334155; color: #F8FAFC; border-radius: 10px; padding: 1px 7px; font-size: 10px; font-weight: 700; }
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 17px; background: #1E293B; border: 1px solid #334155; border-radius: 11px; }
.stat-icon { width: 37px; height: 37px; display: grid; place-items: center; border-radius: 8px; flex: 0 0 auto; }
.stat-icon.blue { background: #3b82f6; color: #fff; }
.stat-icon.green { background: #22c55e; color: #fff; }
.stat-icon.amber { background: #f59e0b; color: #fff; }
.stat-icon.red { background: #ef4444; color: #fff; }
.stat-label { font-size: 12px; color: #94A3B8; }
.stat-value { font-size: 22px; font-weight: 700; color: #F8FAFC; }
.tc-warn { display: flex; align-items: flex-start; gap: 9px; padding: 12px 14px; margin-bottom: 20px; background: #F59E0B18; border: 1px solid #F59E0B; border-radius: 8px; color: #F59E0B; font-size: 13px; line-height: 1.5; }
.tc-warn svg { flex: 0 0 auto; margin-top: 2px; }
.tc-error { display: flex; align-items: center; gap: 8px; padding: 11px 13px; margin-bottom: 14px; background: #EF444418; border: 1px solid #EF4444; border-radius: 8px; color: #EF4444; font-size: 13px; }
.filter-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; }
.search-wrap { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 220px; background: #1E293B; border: 1px solid #334155; border-radius: 8px; padding: 9px 12px; color: #94A3B8; }
.search-wrap input { flex: 1; background: transparent; border: none; outline: none; color: #F8FAFC; font-size: 13px; }
.filter-bar select { background: #1E293B; border: 1px solid #334155; color: #F8FAFC; border-radius: 8px; padding: 9px 12px; font-size: 13px; }
.kb-form-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.kb-form-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.kb-form-header h3 { margin: 0; font-size: 15px; color: #F8FAFC; }
.kb-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.kb-form-field { display: flex; flex-direction: column; gap: 6px; }
.kb-form-field.full { grid-column: 1 / -1; }
.kb-form-field label { font-size: 12px; font-weight: 600; color: #94A3B8; }
.kb-form-field input, .kb-form-field select, .kb-form-field textarea { background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 7px; padding: 10px; font-size: 13px; }
.kb-form-field textarea { font-family: monospace; font-size: 12px; resize: vertical; }
.tc-hint { font-size: 11px; color: #94A3B8; line-height: 1.45; }
.kb-form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.kb-list { display: flex; flex-direction: column; gap: 10px; }
.kb-card { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
.kb-card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.kb-card-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kb-card-actions { display: flex; gap: 4px; flex: 0 0 auto; }
.tc-id { font-size: 13px; font-weight: 700; color: #F8FAFC; letter-spacing: -0.01em; }
.kb-severity-badge { display: inline-flex; align-items: center; gap: 4px; border-radius: 5px; padding: 2px 7px; font-size: 10px; font-weight: 700; }
.kb-type-badge { font-size: 11px; padding: 2px 8px; border-radius: 5px; background: #334155; color: #CBD5E1; font-family: monospace; }
.tc-norules { font-size: 10px; padding: 2px 7px; border-radius: 5px; background: #EF444425; color: #EF4444; font-weight: 700; }
.kb-card-name { font-size: 14px; font-weight: 600; color: #F8FAFC; margin: 0 0 4px; }
.kb-card-desc { font-size: 13px; color: #94A3B8; margin: 0 0 10px; line-height: 1.5; }
.kb-card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.tc-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 5px; }
.tc-tag-green { background: #22c55e22; color: #22c55e; }
.tc-tag-red { background: #ef444422; color: #ef4444; }
.tc-tag-blue { background: #3b82f622; color: #60a5fa; }
.tc-tag-amber { background: #f59e0b22; color: #f59e0b; }
.kb-detail { font-size: 11px; color: #64748B; }
.kb-cand-toggle { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; background: transparent; border: none; color: #F59E0B; font-size: 12px; font-weight: 600; padding: 0; }
.tc-spec { margin-top: 12px; border-top: 1px solid #334155; padding-top: 12px; display: flex; flex-direction: column; gap: 9px; }
.tc-row { display: flex; gap: 12px; font-size: 12px; align-items: flex-start; }
.tc-row > span { flex: 0 0 118px; color: #94A3B8; font-weight: 600; }
.tc-row > div { flex: 1; color: #E2E8F0; display: flex; flex-wrap: wrap; gap: 5px; }
.tc-row code { background: #0F172A; border: 1px solid #334155; border-radius: 4px; padding: 1px 6px; font-size: 11px; color: #CBD5E1; }
.tc-turn { width: 100%; background: #0F172A; border-radius: 5px; padding: 6px 9px; font-size: 11px; color: #CBD5E1; line-height: 1.45; }
.kb-empty { text-align: center; padding: 44px; color: #64748B; }
.kb-empty p { margin: 0; font-size: 14px; max-width: 460px; margin-left: auto; margin-right: auto; line-height: 1.55; }
.kb-suggest { display: flex; flex-direction: column; gap: 18px; }
.kb-suggest-intro h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 15px; color: #F8FAFC; }
.kb-suggest-intro p { margin: 0; font-size: 13px; color: #94A3B8; max-width: 780px; line-height: 1.55; }
.kb-upload-row { display: flex; flex-direction: column; gap: 12px; background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
.kb-upload-box { display: flex; align-items: center; gap: 14px; padding: 18px; background: #0F172A; border: 2px dashed #475569; border-radius: 9px; color: #94A3B8; cursor: pointer; }
.kb-upload-box:hover { border-color: #F59E0B; color: #F8FAFC; }
.kb-upload-box strong { display: block; font-size: 14px; color: #F8FAFC; }
.kb-upload-box p { margin: 3px 0 0; font-size: 12px; }
.kb-uploaded { display: flex; align-items: center; gap: 8px; padding: 9px 12px; background: #0F172A; border: 1px solid #475569; border-radius: 7px; font-size: 13px; color: #F8FAFC; }
.kb-uploaded span { flex: 1; }
.kb-uploaded button { background: transparent; border: none; color: #94A3B8; font-size: 17px; }
.kb-paste { width: 100%; padding: 11px; background: #0F172A; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; font-family: monospace; font-size: 12px; resize: vertical; }
.ti-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ti-head > span { font-size: 12px; font-weight: 600; color: #94A3B8; }
.ti-actions { display: flex; align-items: center; gap: 8px; }
.ti-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ti-footer .tc-hint { flex: 1; min-width: 240px; }
.ti-footer code { background: #0F172A; border: 1px solid #334155; border-radius: 3px; padding: 0 4px; font-size: 11px; }
.ti-results { display: flex; flex-direction: column; gap: 6px; background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
.ti-results-head { margin-bottom: 4px; }
.ti-results-head strong { font-size: 13px; color: #F8FAFC; }
.ti-row { display: flex; align-items: center; gap: 9px; font-size: 12px; padding: 6px 9px; border-radius: 6px; background: #0F172A; }
.ti-row strong { font-family: monospace; }
.ti-row span { color: #94A3B8; }
.ti-ok { color: #4ADE80; }
.ti-fail { color: #F87171; }
.kb-candidates { display: flex; flex-direction: column; gap: 10px; }
.kb-candidates-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.kb-candidates-head strong { font-size: 14px; color: #F8FAFC; }
.kb-candidates-head span { font-size: 13px; color: #94A3B8; }
.kb-cand { background: #1E293B; border: 1px solid #334155; border-radius: 10px; padding: 16px; }
.kb-cand-body { flex: 1; min-width: 0; }
.kb-conf-badge { border-radius: 5px; padding: 2px 7px; font-size: 10px; font-weight: 700; text-transform: capitalize; }
.kb-cand-count { font-size: 11px; color: #94A3B8; font-weight: 600; }
.kb-cand-rationale { margin: 6px 0 4px; font-size: 12px; color: #94A3B8; line-height: 1.5; font-style: italic; }
.tc-cand-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-top: 8px; }
.kb-cand-evidence { margin-top: 10px; display: flex; flex-direction: column; gap: 7px; border-left: 2px solid #334155; padding-left: 12px; }
.kb-ev-row { display: flex; gap: 10px; font-size: 12px; }
.kb-ev-call { flex: 0 0 auto; color: #F59E0B; font-weight: 700; }
.kb-ev-text { color: #CBD5E1; line-height: 1.5; word-break: break-word; }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 720px) { .kb-form-grid { grid-template-columns: 1fr; } .filter-bar { flex-direction: column; align-items: stretch; } }
`

if (typeof document !== 'undefined' && !document.getElementById('test-cases-styles')) {
  const style = document.createElement('style')
  style.id = 'test-cases-styles'
  style.textContent = styles
  document.head.appendChild(style)
}
