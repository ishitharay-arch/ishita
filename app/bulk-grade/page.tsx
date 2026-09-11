'use client'

import { useState, useEffect } from 'react'
import {
  ChevronDown, CheckCircle2, XCircle, Loader2, ArrowRight,
  CircleHelp, Search, Activity, Upload, FileText, AlertTriangle,
  Zap, RotateCcw, Copy, ChevronRight, Gauge, BarChart3, Wrench,
  TrendingUp, Bug
} from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot { id: string; name: string; department: string }

interface BulkGradeResult {
  callNumber: number
  interactionId: string
  transcript: string
  detectedFlow: string
  detectedScenario: string
  detectedDescription: string
  passed: boolean
  status: 'pass' | 'partial' | 'fail'
  failures: string[]
  issueType: string
  rulesEvaluated: number
  runId: string
  resultId: string
}

interface BulkGradeSummary {
  totalInteractions: number
  releaseReadyCount: number
  failedCount: number
  partialCount: number
  passRate: number
  failureReasons: { reason: string; count: number; callIds: { id: string; num: number }[] }[]
}

/* ── helpers ── */

function extractInteractionId(transcript: string): string {
  const m = transcript.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i)
  return m ? m[0] : `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function remediationPlan(reason: string): { fix: string; plan: string } {
  const key = reason.toLowerCase()
  if (key.includes('repeat') || key.includes('repetition'))
    return { fix: 'Tighten the repeat-detection pattern or add variation to the bot prompt', plan: 'Check the consecutive_repeat error pattern threshold. If the bot is repeating hold/transfer phrases, add those to the exclude list. If it is repeating questions, the prompt needs a fallback path after 1 repeat.' }
  if (key.includes('timeout') || key.includes('unanswered'))
    return { fix: 'Add a no-response recovery path or adjust VAD silence timeout', plan: 'The bot asks a question but the caller never responds. Either the Exotel VAD timeout is too short (check platform settings), or the bot prompt lacks a Step 6 no-response handler for this scenario.' }
  if (key.includes('transfer') || key.includes('loop'))
    return { fix: 'Verify the transfer integration works end-to-end', plan: 'The [transfer call] marker fires but the call continues. This is likely a platform integration issue, not a prompt issue. Check that Exotel is wired to actually hand off when it sees the marker.' }
  if (key.includes('compliance') || key.includes('must_say') || key.includes('must_not'))
    return { fix: 'Update the bot prompt to include required phrases', plan: 'The bot is missing a mandated phrase or saying a prohibited one. Map the failing test case to the prompt section that handles that scenario and add/remove the phrase.' }
  if (key.includes('hallucin'))
    return { fix: 'Add guardrails against fabricated data', plan: 'The bot is inventing identifiers or data not from any tool response. Strengthen the anti-hallucination rules in the prompt and verify tool response parsing.' }
  return { fix: 'Review the failing calls and add a targeted error pattern', plan: 'Examine the transcripts where this failure occurs. Identify the common pattern and add it to the Error KB as a new detection rule.' }
}

/* ── component ── */

export default function BulkGradePage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [selectedBotId, setSelectedBotId] = useState('')
  const [transcriptText, setTranscriptText] = useState('')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isGrading, setIsGrading] = useState(false)
  const [results, setResults] = useState<BulkGradeResult[]>([])
  const [summary, setSummary] = useState<BulkGradeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [inputMethod, setInputMethod] = useState<'paste' | 'upload'>('paste')

  // Drill-down state
  const [activeCategory, setActiveCategory] = useState<'good' | 'failed' | 'partial' | null>(null)
  const [expandedCallIdx, setExpandedCallIdx] = useState<number | null>(null)
  const [expandedRemIdx, setExpandedRemIdx] = useState<number | null>(null)
  const [copyingCall, setCopyingCall] = useState<number | null>(null)

  // ── sessionStorage: restore on mount ──
  useEffect(() => {
    try {
      const sr = sessionStorage.getItem('bg-results')
      const ss = sessionStorage.getItem('bg-summary')
      if (sr && ss) {
        setResults(JSON.parse(sr))
        setSummary(JSON.parse(ss))
      }
    } catch {}
  }, [])

  // ── sessionStorage: save on change ──
  useEffect(() => {
    if (summary && results.length > 0) {
      sessionStorage.setItem('bg-results', JSON.stringify(results))
      sessionStorage.setItem('bg-summary', JSON.stringify(summary))
    }
  }, [summary, results])

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
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    fetchBots()
  }, [])

  function parseTranscripts(input: string): string[] {
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
      if (out.length > 0) return out
    }
    const lines = input.split('\n')
    const dashIndices: number[] = []
    lines.forEach((l, i) => { if (/^-{3,}$/.test(l.trim())) dashIndices.push(i) })
    if (dashIndices.length > 0) {
      const out: string[] = []
      let start = 0
      for (const d of dashIndices) {
        const chunk = lines.slice(start, d).join('\n').trim()
        if (chunk) out.push(chunk)
        start = d + 1
      }
      const last = lines.slice(start).join('\n').trim()
      if (last) out.push(last)
      if (out.length > 0) return out
    }
    const trimmed = input.trim()
    return trimmed ? [trimmed] : []
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedFile(file)
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setTranscriptText('')
      try {
        const fd = new FormData(); fd.append('file', file)
        const res = await fetch('/api/parse-pdf', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok || json.error) { alert(`PDF parse failed: ${json.error || res.status}`); setUploadedFile(null); return }
        setTranscriptText(json.text)
      } catch { alert('PDF upload failed'); setUploadedFile(null) }
      return
    }
    setTranscriptText(await file.text())
  }

  async function handleBulkGrade() {
    if (!selectedBotId || !transcriptText.trim()) return
    setIsGrading(true); setResults([]); setSummary(null)
    setActiveCategory(null); setExpandedCallIdx(null); setExpandedRemIdx(null)
    try {
      const transcripts = parseTranscripts(transcriptText)
      const gradeResults: BulkGradeResult[] = []
      for (let i = 0; i < transcripts.length; i++) {
        try {
          const res = await fetch('/api/auto-grade', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId: selectedBotId, transcriptText: transcripts[i] }),
          })
          if (res.ok) {
            const data = await res.json()
            if (data.success) {
              const pf = data.result.patternFailures || []
              const et = pf.map((f: any) => f.errorType)
              gradeResults.push({
                callNumber: i + 1,
                interactionId: extractInteractionId(transcripts[i]),
                transcript: transcripts[i],
                detectedFlow: data.result.detectedFlow,
                detectedScenario: data.result.detectedScenario,
                detectedDescription: data.result.detectedDescription,
                passed: data.result.passed,
                status: data.result.status || (data.result.passed ? 'pass' : 'partial'),
                failures: data.result.failures,
                issueType: data.result.passed ? 'None' : et[0] ? et[0].charAt(0).toUpperCase() + et[0].slice(1) : 'General',
                rulesEvaluated: data.result.rulesEvaluated ?? 0,
                runId: data.result.runId,
                resultId: data.result.resultId,
              })
            }
          }
        } catch (err) { console.error(`Error grading #${i + 1}:`, err) }
      }
      setResults(gradeResults)
      const total = gradeResults.length
      const passed = gradeResults.filter(r => r.passed).length
      const failed = gradeResults.filter(r => !r.passed && r.status === 'fail').length
      const partial = gradeResults.filter(r => !r.passed && r.status !== 'fail').length
      const fc: Record<string, { count: number; callIds: { id: string; num: number }[] }> = {}
      gradeResults.forEach(r => r.failures.forEach(f => {
        const parts = f.split(':')
        const key = parts.length >= 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : f
        if (!fc[key]) fc[key] = { count: 0, callIds: [] }
        fc[key].count++
        if (!fc[key].callIds.find(c => c.id === r.interactionId)) {
          fc[key].callIds.push({ id: r.interactionId, num: r.callNumber })
        }
      }))
      setSummary({
        totalInteractions: total, releaseReadyCount: passed,
        failedCount: failed, partialCount: partial,
        passRate: total > 0 ? (passed / total) * 100 : 0,
        failureReasons: Object.entries(fc).map(([reason, v]) => ({ reason, count: v.count, callIds: v.callIds })).sort((a, b) => b.count - a.count).slice(0, 8),
      })
    } catch (e) { console.error(e) }
    finally { setIsGrading(false) }
  }

  async function handleCopyForClaude(r: BulkGradeResult) {
    setCopyingCall(r.callNumber)
    try {
      const res = await fetch(`/api/llm-context?botId=${encodeURIComponent(selectedBotId)}`)
      const ctx = await res.json()
      if (!ctx.success) { alert('Context load failed'); setCopyingCall(null); return }
      const bot = bots.find(b => b.id === selectedBotId)
      const tc = (ctx.testCases || []).map((t: any) =>
        `${t.id} — ${t.scenario_type} (${t.priority})\n  Goal: ${t.goal}\n` +
        (t.must_say?.length ? `  Must say: ${t.must_say.join(', ')}\n` : '') +
        (t.must_not_say?.length ? `  Must not say: ${t.must_not_say.join(', ')}\n` : '')
      ).join('\n')
      const ep = (ctx.errorPatterns || []).map((e: any) => `[${e.severity}] ${e.name}: ${e.description}`).join('\n') || '(none)'
      const fr = (ctx.flowRules || []).map((f: any) => `"${f.label}" → ${f.test_case_id}`).join('\n') || '(none)'
      const prompt = `You are grading a voice bot call transcript for MediBuddy customer support. Be strict.\n\nBOT: ${bot?.name || ctx.bot.name} (${bot?.department || ctx.bot.department})\n\nSYSTEM PROMPT:\n${ctx.systemPrompt}\n\nTEST CASES:\n${tc}\n\nERROR PATTERNS:\n${ep}\n\nFLOW RULES:\n${fr}\n\nTRANSCRIPT:\n${r.transcript}\n\nReturn ONLY JSON (no markdown):\n{"verdict":"pass/fail","detected_flow":"test case ID or null","confidence":0.0-1.0,"failures":[{"rule":"name","detail":"what went wrong","severity":"critical/major/minor"}],"summary":"2-3 sentences","remarks":"observations about uncovered issues"}`
      await navigator.clipboard.writeText(prompt)
      setCopyingCall(-r.callNumber)
      setTimeout(() => setCopyingCall(null), 2500)
    } catch { setCopyingCall(null) }
  }

  const goodCalls = results.filter(r => r.passed)
  const failedCalls = results.filter(r => !r.passed && r.status === 'fail')
  const partialCalls = results.filter(r => !r.passed && r.status !== 'fail')

  const categoryItems = activeCategory === 'good' ? goodCalls
    : activeCategory === 'failed' ? failedCalls
    : activeCategory === 'partial' ? partialCalls : []

  if (loading) return (
    <main className="app-shell"><Sidebar /><section className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Bulk Grade</strong></div>
      <div className="top-actions"><button className="icon-button"><Search size={17} /></button><button className="icon-button"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div></header>
      <div className="page-wrap"><div className="au-loading"><Loader2 size={22} className="spin" /> Loading...</div></div>
    </section></main>
  )

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Bulk Grade</strong></div>
          <div className="top-actions"><button className="icon-button"><Search size={17} /></button><button className="icon-button"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div>
        </header>
        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Activity size={14} /> Bulk Grading</div>
              <h1>Bulk Grade Transcripts</h1>
              <p>Upload transcripts, auto-grade at scale, drill into any call.</p>
            </div>
          </div>

          {/* ── Upload form ── */}
          {!summary && (
            <div className="bg-form">
              <div className="bg-row">
                <label className="bg-label">
                  Bot
                  <select value={selectedBotId} onChange={e => setSelectedBotId(e.target.value)}>
                    <option value="">Select a bot</option>
                    {bots.map(b => <option key={b.id} value={b.id}>{b.name} ({b.department})</option>)}
                  </select>
                </label>
              </div>
              <div className="bg-toggle">
                <button className={inputMethod === 'paste' ? 'active' : ''} onClick={() => setInputMethod('paste')}><FileText size={15} /> Paste</button>
                <button className={inputMethod === 'upload' ? 'active' : ''} onClick={() => setInputMethod('upload')}><Upload size={15} /> Upload</button>
              </div>
              {inputMethod === 'paste' ? (
                <textarea className="bg-textarea" value={transcriptText} onChange={e => setTranscriptText(e.target.value)}
                  placeholder="Paste call transcripts here — multiple calls auto-detected by UUID headers." rows={12} />
              ) : (
                <div className="bg-upload">
                  <input type="file" accept=".txt,.pdf" onChange={handleFileUpload} id="bg-file" style={{display:'none'}} />
                  <label htmlFor="bg-file" className="bg-upload-label">
                    <Upload size={28} />
                    <span>Click to upload .txt or .pdf</span>
                  </label>
                  {uploadedFile && <div className="bg-uploaded"><FileText size={14} /> {uploadedFile.name} <button onClick={() => { setUploadedFile(null); setTranscriptText('') }}>x</button></div>}
                </div>
              )}
              <button className="bg-btn-primary" onClick={handleBulkGrade} disabled={!selectedBotId || !transcriptText.trim() || isGrading}>
                {isGrading ? <><Loader2 size={15} className="spin" /> Grading...</> : <><Zap size={15} /> Bulk Grade</>}
              </button>
            </div>
          )}

          {/* ── Results ── */}
          {summary && (
            <div className="bg-results">

              {/* ── Stat row ── */}
              <div className="bg-stats">
                <div className="bg-stat">
                  <div className="bg-stat-icon" style={{background:'#3b82f6'}}><FileText size={16} /></div>
                  <div><div className="bg-stat-val">{summary.totalInteractions}</div><div className="bg-stat-lbl">Total</div></div>
                </div>
                <div className="bg-stat">
                  <div className="bg-stat-icon" style={{background:'#22c55e'}}><CheckCircle2 size={16} /></div>
                  <div><div className="bg-stat-val">{summary.releaseReadyCount}</div><div className="bg-stat-lbl">Passed</div></div>
                </div>
                <div className="bg-stat">
                  <div className="bg-stat-icon" style={{background:'#ef4444'}}><XCircle size={16} /></div>
                  <div><div className="bg-stat-val">{summary.failedCount}</div><div className="bg-stat-lbl">Failed</div></div>
                </div>
                <div className="bg-stat">
                  <div className="bg-stat-icon" style={{background:'#f59e0b'}}><AlertTriangle size={16} /></div>
                  <div><div className="bg-stat-val">{summary.partialCount}</div><div className="bg-stat-lbl">Partial</div></div>
                </div>
                <div className="bg-stat">
                  <div className="bg-stat-icon" style={{background:'#8b5cf6'}}><Gauge size={16} /></div>
                  <div><div className="bg-stat-val">{summary.passRate.toFixed(1)}%</div><div className="bg-stat-lbl">Pass rate</div></div>
                </div>
              </div>

              {/* ── Distribution visual ── */}
              <div className="bg-dist">
                <div className="bg-dist-bar">
                  {summary.releaseReadyCount > 0 && <div className="bg-dist-seg bg-dist-pass" style={{flex: summary.releaseReadyCount}}>{summary.releaseReadyCount}</div>}
                  {summary.partialCount > 0 && <div className="bg-dist-seg bg-dist-partial" style={{flex: summary.partialCount}}>{summary.partialCount}</div>}
                  {summary.failedCount > 0 && <div className="bg-dist-seg bg-dist-fail" style={{flex: summary.failedCount}}>{summary.failedCount}</div>}
                </div>
                <div className="bg-dist-legend">
                  <span><span className="bg-dot" style={{background:'#22c55e'}} /> Pass {(summary.releaseReadyCount / summary.totalInteractions * 100).toFixed(0)}%</span>
                  <span><span className="bg-dot" style={{background:'#f59e0b'}} /> Partial {(summary.partialCount / summary.totalInteractions * 100).toFixed(0)}%</span>
                  <span><span className="bg-dot" style={{background:'#ef4444'}} /> Fail {(summary.failedCount / summary.totalInteractions * 100).toFixed(0)}%</span>
                </div>
              </div>

              {/* ── Remediation priorities ── */}
              {summary.failureReasons.length > 0 && (
                <div className="bg-section">
                  <h3><Wrench size={16} /> Remediation priorities</h3>
                  <div className="bg-rem-list">
                    {summary.failureReasons.map((item, i) => {
                      const plan = remediationPlan(item.reason)
                      const isOpen = expandedRemIdx === i
                      return (
                        <div key={i} className={`bg-rem ${isOpen ? 'bg-rem-open' : ''}`} onClick={() => setExpandedRemIdx(isOpen ? null : i)}>
                          <div className="bg-rem-head">
                            <ChevronRight size={14} className={`bg-rem-chev ${isOpen ? 'bg-rem-chev-open' : ''}`} />
                            <span className="bg-rem-rank">{i + 1}</span>
                            <span className="bg-rem-name">{item.reason}</span>
                            <span className="bg-rem-count">{item.count} call{item.count !== 1 ? 's' : ''}</span>
                          </div>
                          {isOpen && (
                            <div className="bg-rem-body">
                              <div className="bg-rem-fix"><strong>Fix:</strong> {plan.fix}</div>
                              <div className="bg-rem-plan"><strong>Implementation:</strong> {plan.plan}</div>
                              <div className="bg-rem-calls">
                                <strong>Affected calls:</strong>
                                <div className="bg-rem-ids">
                                  {item.callIds.map((c, j) => (
                                    <span key={j} className="bg-rem-id" title={c.id}>#{c.num} <span>{c.id}</span></span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Call categories ── */}
              <div className="bg-section">
                <h3><BarChart3 size={16} /> Call analysis</h3>
                <div className="bg-cats">
                  {([
                    { key: 'good' as const, label: 'Good calls', count: goodCalls.length, color: '#22c55e', icon: <CheckCircle2 size={18} /> },
                    { key: 'failed' as const, label: 'Failed calls', count: failedCalls.length, color: '#ef4444', icon: <XCircle size={18} /> },
                    { key: 'partial' as const, label: 'Partial calls', count: partialCalls.length, color: '#f59e0b', icon: <AlertTriangle size={18} /> },
                  ]).map(cat => (
                    <button
                      key={cat.key}
                      className={`bg-cat ${activeCategory === cat.key ? 'bg-cat-active' : ''}`}
                      style={{ '--cat-color': cat.color } as any}
                      onClick={() => { setActiveCategory(activeCategory === cat.key ? null : cat.key); setExpandedCallIdx(null) }}
                    >
                      {cat.icon}
                      <span className="bg-cat-label">{cat.label}</span>
                      <span className="bg-cat-count" style={{background: cat.color}}>{cat.count}</span>
                      <ChevronDown size={14} className={`bg-cat-chev ${activeCategory === cat.key ? 'bg-cat-chev-open' : ''}`} />
                    </button>
                  ))}
                </div>

                {/* ── Call list for selected category ── */}
                {activeCategory && categoryItems.length > 0 && (
                  <div className="bg-call-list">
                    {categoryItems.map((r) => {
                      const isOpen = expandedCallIdx === r.callNumber
                      return (
                        <div key={r.callNumber} className="bg-call-item">
                          <div className="bg-call-row" onClick={() => setExpandedCallIdx(isOpen ? null : r.callNumber)}>
                            <ChevronRight size={14} className={`bg-call-chev ${isOpen ? 'bg-call-chev-open' : ''}`} />
                            <span className="bg-call-num">#{r.callNumber}</span>
                            <span className="bg-call-id">{r.interactionId}</span>
                            <span className="bg-call-flow">{r.detectedFlow}</span>
                            <span className="bg-call-scenario">{r.detectedScenario}</span>
                            {r.failures.length > 0 && <span className="bg-call-fcount">{r.failures.length} issue{r.failures.length !== 1 ? 's' : ''}</span>}
                            <div className="bg-call-actions">
                              {(r.passed || r.status === 'partial' || r.rulesEvaluated === 0) && <span className="bg-rec-badge">Recommended</span>}
                              <button className="bg-claude-btn" onClick={(e) => { e.stopPropagation(); handleCopyForClaude(r) }}>
                                {copyingCall === -r.callNumber ? <><CheckCircle2 size={12} /> Copied</> : copyingCall === r.callNumber ? <Loader2 size={12} className="spin" /> : <><Copy size={12} /> Claude</>}
                              </button>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="bg-call-detail">
                              <div className="bg-call-meta">
                                <div><span>Flow</span><strong>{r.detectedFlow}</strong></div>
                                <div><span>Scenario</span><strong>{r.detectedScenario}</strong></div>
                                <div><span>Rules checked</span><strong className={r.rulesEvaluated === 0 ? 'bg-danger' : ''}>{r.rulesEvaluated === 0 ? 'None' : r.rulesEvaluated}</strong></div>
                                <div><span>Issue type</span><strong>{r.issueType}</strong></div>
                              </div>
                              {r.detectedDescription && (
                                <p className="bg-call-desc">{r.detectedDescription}</p>
                              )}
                              {r.failures.length > 0 && (
                                <div className="bg-call-failures">
                                  <strong>Failures</strong>
                                  {r.failures.map((f, i) => <div key={i} className="bg-call-f"><Bug size={12} /> {f}</div>)}
                                </div>
                              )}
                              {r.passed && r.rulesEvaluated === 0 && (
                                <div className="bg-call-warn">This call passed because no rules were checked — it may be a false pass. Use Copy for Claude to verify.</div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {activeCategory && categoryItems.length === 0 && (
                  <div className="bg-empty">No calls in this category.</div>
                )}
              </div>

              <button className="bg-btn-secondary" onClick={() => { setSummary(null); setResults([]); setTranscriptText(''); setUploadedFile(null); setActiveCategory(null); sessionStorage.removeItem('bg-results'); sessionStorage.removeItem('bg-summary') }}>
                <RotateCcw size={15} /> New batch
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

const styles = `
:root { --ink: #F8FAFC; --muted: #94A3B8; --line: #334155; --surface: #1E293B; --wash: #0F172A; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--wash); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; }
button, select, textarea { font: inherit; }
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
.main-content { flex: 1; display: flex; flex-direction: column; background: var(--wash); }
.topbar { background: var(--surface); border-bottom: 1px solid var(--line); padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.breadcrumb strong { color: var(--ink); }
.top-actions { display: flex; align-items: center; gap: 12px; }
.icon-button { background: transparent; border: none; color: var(--muted); padding: 8px; border-radius: 8px; }
.icon-button:hover { background: var(--line); color: var(--ink); }
.top-avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.page-wrap { padding: 32px; flex: 1; }
.page-heading { margin-bottom: 28px; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 700; margin-bottom: 6px; }
.page-heading h1 { margin: 0 0 6px; font-size: 26px; font-weight: 700; color: var(--ink); }
.page-heading p { margin: 0; color: var(--muted); font-size: 14px; }
.au-loading { display: flex; align-items: center; gap: 10px; justify-content: center; padding: 60px; color: var(--muted); }
.bg-form { max-width: 780px; }
.bg-row { margin-bottom: 18px; }
.bg-label { display: block; font-size: 12px; font-weight: 600; color: var(--muted); }
.bg-label select { width: 100%; margin-top: 6px; padding: 11px 14px; background: var(--surface); border: 1px solid #475569; color: var(--ink); border-radius: 8px; font-size: 14px; appearance: none; }
.bg-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
.bg-toggle button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; padding: 10px; background: var(--surface); border: 1px solid #475569; color: var(--muted); border-radius: 8px; font-size: 13px; font-weight: 500; }
.bg-toggle button:hover { color: var(--ink); }
.bg-toggle button.active { background: #F59E0B; color: #0F172A; border-color: #F59E0B; }
.bg-textarea { width: 100%; padding: 12px; background: var(--surface); border: 1px solid #475569; color: var(--ink); border-radius: 8px; font-size: 13px; font-family: monospace; resize: vertical; margin-bottom: 16px; }
.bg-upload-label { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 36px; background: var(--surface); border: 2px dashed #475569; border-radius: 10px; color: var(--muted); cursor: pointer; margin-bottom: 16px; }
.bg-upload-label:hover { border-color: #F59E0B; }
.bg-uploaded { display: flex; align-items: center; gap: 8px; padding: 10px 14px; background: var(--surface); border: 1px solid #475569; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
.bg-uploaded button { background: none; border: none; color: var(--muted); font-size: 16px; margin-left: auto; }
.bg-btn-primary { background: #F59E0B; color: #0F172A; border: none; padding: 11px 22px; border-radius: 8px; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 7px; min-height: 44px; }
.bg-btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.bg-btn-secondary { background: var(--line); color: var(--ink); border: 1px solid #475569; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 7px; margin-top: 24px; }
.bg-results { display: flex; flex-direction: column; gap: 24px; }
.bg-stats { display: flex; gap: 12px; }
.bg-stat { display: flex; align-items: center; gap: 12px; flex: 1; padding: 16px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.bg-stat-icon { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; color: white; flex-shrink: 0; }
.bg-stat-val { font-size: 22px; font-weight: 700; color: var(--ink); line-height: 1; }
.bg-stat-lbl { font-size: 11px; color: var(--muted); margin-top: 2px; }
.bg-dist { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 18px 20px; }
.bg-dist-bar { display: flex; height: 36px; border-radius: 6px; overflow: hidden; gap: 2px; }
.bg-dist-seg { display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; min-width: 30px; }
.bg-dist-pass { background: #22c55e; }
.bg-dist-partial { background: #f59e0b; }
.bg-dist-fail { background: #ef4444; }
.bg-dist-legend { display: flex; gap: 20px; margin-top: 12px; font-size: 12px; color: var(--muted); }
.bg-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px; vertical-align: middle; }
.bg-section { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px 22px; }
.bg-section h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 16px; font-size: 15px; font-weight: 650; color: var(--ink); }
.bg-rem-list { display: flex; flex-direction: column; gap: 6px; }
.bg-rem { background: var(--wash); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; transition: border-color .15s; }
.bg-rem:hover { border-color: #475569; }
.bg-rem-open { border-color: #F59E0B44; }
.bg-rem-head { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
.bg-rem-chev { color: var(--muted); transition: transform .15s; flex-shrink: 0; }
.bg-rem-chev-open { transform: rotate(90deg); }
.bg-rem-rank { width: 22px; height: 22px; background: #F59E0B; color: #0F172A; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
.bg-rem-name { flex: 1; font-size: 13px; font-weight: 600; color: var(--ink); }
.bg-rem-count { font-size: 11px; color: var(--muted); background: var(--line); padding: 2px 9px; border-radius: 10px; }
.bg-rem-body { padding: 0 14px 14px 46px; }
.bg-rem-fix { font-size: 13px; color: #22c55e; margin-bottom: 8px; line-height: 1.5; }
.bg-rem-fix strong { color: #4ADE80; }
.bg-rem-plan { font-size: 12px; color: var(--muted); line-height: 1.55; }
.bg-rem-plan strong { color: #CBD5E1; }
.bg-cats { display: flex; gap: 10px; margin-bottom: 4px; }
.bg-cat { display: flex; align-items: center; gap: 8px; flex: 1; padding: 14px 16px; background: var(--wash); border: 1px solid var(--line); border-radius: 8px; color: var(--muted); font-size: 13px; font-weight: 600; transition: all .15s; }
.bg-cat:hover { border-color: var(--cat-color, #475569); color: var(--ink); }
.bg-cat-active { border-color: var(--cat-color, #475569); background: color-mix(in srgb, var(--cat-color, #475569) 8%, var(--wash)); color: var(--ink); }
.bg-cat-label { flex: 1; text-align: left; }
.bg-cat-count { font-size: 12px; font-weight: 700; color: white; padding: 2px 9px; border-radius: 10px; }
.bg-cat-chev { color: var(--muted); transition: transform .15s; }
.bg-cat-chev-open { transform: rotate(180deg); }
.bg-call-list { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
.bg-call-item { background: var(--wash); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.bg-call-row { display: flex; align-items: center; gap: 10px; padding: 11px 14px; cursor: pointer; font-size: 12px; }
.bg-call-row:hover { background: #172033; }
.bg-call-chev { color: var(--muted); transition: transform .15s; flex-shrink: 0; }
.bg-call-chev-open { transform: rotate(90deg); }
.bg-call-num { font-weight: 700; color: var(--muted); width: 32px; flex-shrink: 0; }
.bg-call-id { font-family: monospace; color: #64748B; background: var(--line); padding: 2px 8px; border-radius: 4px; font-size: 11px; flex-shrink: 0; }
.bg-call-flow { font-family: monospace; color: #CBD5E1; font-size: 11px; }
.bg-call-scenario { color: var(--muted); font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bg-call-fcount { font-size: 10px; color: #F87171; background: #EF444420; padding: 2px 8px; border-radius: 10px; font-weight: 600; flex-shrink: 0; }
.bg-claude-btn { background: var(--surface); color: #A78BFA; border: 1px solid #7C3AED44; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
.bg-claude-btn:hover { border-color: #7C3AED; color: #C4B5FD; }
.bg-call-actions { display: flex; align-items: center; gap: 6px; margin-left: auto; flex-shrink: 0; }
.bg-rec-badge { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #F59E0B; background: #F59E0B18; border: 1px solid #F59E0B44; padding: 3px 8px; border-radius: 4px; }
.bg-rem-calls { margin-top: 10px; }
.bg-rem-calls strong { font-size: 11px; color: #CBD5E1; display: block; margin-bottom: 6px; }
.bg-rem-ids { display: flex; flex-wrap: wrap; gap: 5px; }
.bg-rem-id { font-size: 11px; background: var(--line); color: var(--muted); padding: 3px 9px; border-radius: 4px; display: inline-flex; align-items: center; gap: 5px; }
.bg-rem-id span { font-family: monospace; font-size: 10px; color: #64748B; }
.bg-call-detail { padding: 14px 14px 16px 40px; border-top: 1px solid var(--line); background: #0D1321; }
.bg-call-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
.bg-call-meta div { display: flex; flex-direction: column; gap: 2px; }
.bg-call-meta span { font-size: 10px; color: var(--muted); }
.bg-call-meta strong { font-size: 13px; color: var(--ink); }
.bg-danger { color: #F87171 !important; }
.bg-call-desc { font-size: 12px; color: var(--muted); margin: 0 0 12px; line-height: 1.5; }
.bg-call-failures { margin-top: 8px; }
.bg-call-failures strong { display: block; font-size: 12px; color: var(--ink); margin-bottom: 6px; }
.bg-call-f { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; color: #F87171; padding: 5px 0; line-height: 1.4; }
.bg-call-warn { font-size: 12px; color: #FBBF24; background: #F59E0B10; border: 1px solid #F59E0B33; border-radius: 6px; padding: 9px 12px; margin-top: 10px; line-height: 1.5; }
.bg-empty { text-align: center; padding: 24px; color: #64748B; font-size: 13px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (max-width: 900px) {
  .bg-stats { flex-wrap: wrap; }
  .bg-cats { flex-direction: column; }
  .bg-call-meta { grid-template-columns: 1fr 1fr; }
}
`

if (typeof document !== 'undefined' && !document.getElementById('bulk-grade-styles')) {
  const style = document.createElement('style')
  style.id = 'bulk-grade-styles'
  style.textContent = styles
  document.head.appendChild(style)
}