'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, CheckCircle2, XCircle, Loader2, ArrowRight, Search, CircleHelp, Activity, Copy, ClipboardPaste, Brain, Zap } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

interface Bot {
  id: string
  name: string
  department: string
}

interface TestCase {
  id: string
  bot_id: string
  spec: {
    id: string
    scenario_type: string
    priority: string
    persona: string
    goal: string
    caller_turns: string[]
    expected_tools: string[]
    must_say: string[]
    must_not_say: string[]
    expect_terminal_state: boolean
  }
  approved_by: string
  approved_at: string
}

interface GradeResult {
  passed: boolean
  failures: string[]
  runId?: string
  resultId?: string
  detectedFlow?: string
  detectedDescription?: string
}

interface LlmVerdict {
  verdict: string
  detected_flow?: string
  confidence?: number
  failures: { rule: string; detail: string; severity: string }[]
  summary?: string
  remarks?: string
}

/* ─── Prompt builder ─── */

function buildClaudePrompt(
  bot: Bot,
  systemPrompt: string,
  testCases: any[],
  errorPatterns: any[],
  flowRules: any[],
  transcript: string
): string {
  const tcBlock = testCases.map(tc =>
    `• ${tc.id} — ${tc.scenario_type} (${tc.priority})\n` +
    `  Goal: ${tc.goal}\n` +
    (tc.must_say?.length ? `  Must say: ${tc.must_say.join(', ')}\n` : '') +
    (tc.must_not_say?.length ? `  Must not say: ${tc.must_not_say.join(', ')}\n` : '') +
    (tc.expected_tools?.length ? `  Expected tools: ${tc.expected_tools.join(' → ')}\n` : '')
  ).join('\n')

  const epBlock = errorPatterns.length > 0
    ? errorPatterns.map(ep =>
        `• [${ep.severity}] ${ep.name}: ${ep.description}\n` +
        (ep.detection_config ? `  Detect: ${ep.detection_config}` : '')
      ).join('\n')
    : '(none defined yet)'

  const frBlock = flowRules.length > 0
    ? flowRules.map(fr =>
        `• "${fr.label}" → ${fr.test_case_id} (${fr.match_config || ''})`
      ).join('\n')
    : '(none defined yet)'

  return `You are grading a voice bot call transcript for MediBuddy's customer support team.

Your job: read the transcript, identify which scenario the call is about, and grade whether the bot handled it correctly. Be strict — if the bot made a mistake that would frustrate a real caller, it's a failure.

═══ BOT ═══
Name: ${bot.name}
Department: ${bot.department}

═══ BOT'S SYSTEM PROMPT ═══
${systemPrompt}

═══ TEST CASES (scenarios the bot must handle) ═══
${tcBlock}

═══ ERROR PATTERNS (known issues to check for) ═══
${epBlock}

═══ FLOW RULES (how to detect which scenario a call is) ═══
${frBlock}

═══ TRANSCRIPT ═══
${transcript}

═══ INSTRUCTIONS ═══
1. First identify which test case (scenario) this call matches. Use the flow rules and caller intent to decide.
2. Check every must_say / must_not_say rule for that test case.
3. Check every error pattern — look for the detect phrases and behavioral issues.
4. Also flag anything the bot did wrong that is NOT covered by existing rules — this is the main value you add over deterministic grading.
5. Be specific about what went wrong and where in the transcript.

Return ONLY a JSON object with this exact structure (no markdown, no backticks, no explanation outside the JSON):

{
  "verdict": "pass" or "fail",
  "detected_flow": "the test case ID that best matches this call, or null if none match",
  "confidence": 0.0 to 1.0,
  "failures": [
    {
      "rule": "short rule name (e.g. must_say, tone, resolution, hallucination, or a new one you identify)",
      "detail": "specific description of what went wrong",
      "severity": "critical" or "major" or "minor"
    }
  ],
  "summary": "2-3 sentence summary of the call — what the caller wanted and what happened",
  "remarks": "any observations about issues not covered by existing rules that should become new error patterns"
}`
}

/* ─── Component ─── */

export default function GradePage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [selectedBotId, setSelectedBotId] = useState<string>('')
  const [selectedTestCaseId, setSelectedTestCaseId] = useState<string>('')
  const [transcript, setTranscript] = useState<string>('')
  const [botNameInput, setBotNameInput] = useState<string>('')
  const [isGrading, setIsGrading] = useState(false)
  const [result, setResult] = useState<GradeResult | null>(null)
  const [loading, setLoading] = useState(true)

  // Claude LLM state
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle')
  const [claudeJson, setClaudeJson] = useState('')
  const [llmVerdict, setLlmVerdict] = useState<LlmVerdict | null>(null)
  const [llmError, setLlmError] = useState('')
  const [savingLlm, setSavingLlm] = useState(false)
  const [llmSaved, setLlmSaved] = useState(false)

  // ── sessionStorage: restore on mount ──
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('grade-state')
      if (s) {
        const saved = JSON.parse(s)
        if (saved.transcript) setTranscript(saved.transcript)
        if (saved.selectedBotId) setSelectedBotId(saved.selectedBotId)
        if (saved.selectedTestCaseId) setSelectedTestCaseId(saved.selectedTestCaseId)
        if (saved.result) setResult(saved.result)
        if (saved.llmVerdict) setLlmVerdict(saved.llmVerdict)
        if (saved.claudeJson) setClaudeJson(saved.claudeJson)
      }
    } catch {}
  }, [])

  // ── sessionStorage: save on change ──
  useEffect(() => {
    if (transcript || result || llmVerdict) {
      sessionStorage.setItem('grade-state', JSON.stringify({
        transcript, selectedBotId, selectedTestCaseId, result, llmVerdict, claudeJson
      }))
    }
  }, [transcript, selectedBotId, selectedTestCaseId, result, llmVerdict, claudeJson])

  useEffect(() => {
    async function fetchBots() {
      try {
        const response = await fetch('/api/grade-data')
        if (response.ok) {
          const data = await response.json()
          setBots(data.bots)
          if (data.bots.length > 0 && !selectedBotId) setSelectedBotId(data.bots[0].id)
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
    if (!selectedBotId) { setTestCases([]); return }
    async function fetchTestCases() {
      try {
        const response = await fetch(`/api/grade-data?botId=${encodeURIComponent(selectedBotId)}`)
        if (response.ok) {
          const data = await response.json()
          setTestCases(data.testCases)
        } else setTestCases([])
      } catch (error) {
        console.error('Failed to fetch test cases:', error)
        setTestCases([])
      }
    }
    fetchTestCases()
  }, [selectedBotId])

  const filteredTestCases = testCases.filter(tc => tc.bot_id === selectedBotId)

  /* Deterministic grade */
  async function handleGrade() {
    if (!selectedBotId || !selectedTestCaseId || !transcript.trim()) return
    setIsGrading(true); setResult(null)
    try {
      const selectedBot = bots.find(b => b.id === selectedBotId)
      const response = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBotId,
          botName: selectedBot?.name || botNameInput,
          testCaseId: selectedTestCaseId,
          transcriptText: transcript,
        }),
      })
      if (response.ok) {
        const data = await response.json()
        setResult(data.result)
      }
    } catch (error) {
      console.error('Error grading transcript:', error)
    } finally {
      setIsGrading(false)
    }
  }

  /* Auto grade */
  async function handleAutoGrade() {
    if (!selectedBotId || !transcript.trim()) return
    setIsGrading(true); setResult(null)
    try {
      const selectedBot = bots.find(b => b.id === selectedBotId)
      const res = await fetch('/api/auto-grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBotId,
          botName: selectedBot?.name || botNameInput,
          transcriptText: transcript,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setResult(data.result)
        setSelectedTestCaseId(data.result.detectedFlow)
      } else {
        alert('Auto-grade failed: ' + data.error)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsGrading(false)
    }
  }

  /* Copy for Claude */
  async function handleCopyForClaude() {
    if (!selectedBotId || !transcript.trim()) return
    setCopyStatus('copying')
    try {
      const res = await fetch(`/api/llm-context?botId=${encodeURIComponent(selectedBotId)}`)
      const ctx = await res.json()
      if (!ctx.success) { alert('Failed to load context: ' + ctx.error); setCopyStatus('idle'); return }

      const bot = bots.find(b => b.id === selectedBotId) || { name: ctx.bot.name, department: ctx.bot.department, id: selectedBotId }
      const prompt = buildClaudePrompt(
        bot as Bot,
        ctx.systemPrompt,
        ctx.testCases,
        ctx.errorPatterns,
        ctx.flowRules,
        transcript,
      )
      await navigator.clipboard.writeText(prompt)
      setCopyStatus('copied')
      setTimeout(() => setCopyStatus('idle'), 3000)
    } catch (error) {
      console.error('Copy failed:', error)
      setCopyStatus('idle')
    }
  }

  /* Parse + save Claude verdict */
  async function handleSaveClaudeVerdict() {
    setLlmError('')
    setLlmVerdict(null)
    setLlmSaved(false)

    let parsed: LlmVerdict
    try {
      const cleaned = claudeJson.trim().replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      setLlmError("Could not parse JSON. Make sure you copied the full response.")
      return
    }

    if (!parsed.verdict) {
      setLlmError('JSON is missing the "verdict" field.')
      return
    }

    setLlmVerdict(parsed)

    setSavingLlm(true)
    try {
      const res = await fetch('/api/llm-verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: selectedBotId,
          resultId: result?.resultId || null,
          runId: result?.runId || null,
          transcript,
          claudeVerdict: parsed,
        }),
      })
      const data = await res.json()
      if (data.success) setLlmSaved(true)
      else setLlmError('Saved locally but backend returned: ' + data.error)
    } catch (error) {
      setLlmError('Could not save to backend — verdict displayed but not stored.')
    } finally {
      setSavingLlm(false)
    }
  }

  const selectedTestCase = testCases.find(tc => tc.id === selectedTestCaseId)

  if (loading) {
    return (
      <main className="app-shell">
        <Sidebar />
        <section className="main-content">
          <header className="topbar">
            <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Grade</strong></div>
            <div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={17} /></button><button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div>
          </header>
          <div className="page-wrap">
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin" size={24} />
              <span className="ml-2">Loading...</span>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Grade</strong></div>
          <div className="top-actions"><button className="icon-button" aria-label="Search"><Search size={17} /></button><button className="icon-button" aria-label="Help"><CircleHelp size={17} /></button><div className="top-avatar">IA</div></div>
        </header>
        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Activity size={14} /> Manual Grading</div>
              <h1>Grade Transcript</h1>
              <p>Paste a call transcript and grade it against hard rules — or copy the context to Claude for LLM-assisted grading.</p>
            </div>
          </div>

          <div className="grade-form">
            {/* Bot picker */}
            <div className="form-row">
              <label>
                Bot
                <select
                  value={selectedBotId}
                  onChange={(e) => {
                    setSelectedBotId(e.target.value)
                    setSelectedTestCaseId('')
                    const selectedBot = bots.find(b => b.id === e.target.value)
                    if (selectedBot) setBotNameInput(selectedBot.name)
                  }}
                >
                  <option value="">Select a bot</option>
                  {bots.map(bot => (
                    <option key={bot.id} value={bot.id}>{bot.name} ({bot.department})</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>

            {/* Test case picker */}
            <div className="form-row-full">
              <label>
                Test Case
                <select
                  value={selectedTestCaseId}
                  onChange={(e) => setSelectedTestCaseId(e.target.value)}
                  disabled={!selectedBotId || filteredTestCases.length === 0}
                >
                  <option value="">Select a test case</option>
                  {filteredTestCases.map(tc => (
                    <option key={tc.id} value={tc.id}>{tc.spec.id} - {tc.spec.scenario_type} ({tc.spec.priority})</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </label>
            </div>

            {/* Transcript */}
            <label>
              Transcript
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste the call transcript here. Format: SPEAKER: text on each line."
                rows={15}
              />
            </label>

            {/* Action buttons */}
            <div className="grade-actions">
              <button
                className="primary-button"
                onClick={handleGrade}
                disabled={!selectedBotId || !selectedTestCaseId || !transcript.trim() || isGrading}
              >
                {isGrading ? <Loader2 className="animate-spin" size={16} /> : 'Grade'}
              </button>

              <button
                className="primary-button auto-grade-btn"
                onClick={handleAutoGrade}
                disabled={!selectedBotId || !transcript.trim() || isGrading}
              >
                {isGrading ? <Loader2 className="animate-spin" size={16} /> : <><Zap size={14} /> Auto Grade</>}
              </button>

              <button
                className="claude-copy-btn"
                onClick={handleCopyForClaude}
                disabled={!selectedBotId || !transcript.trim() || copyStatus === 'copying'}
              >
                {copyStatus === 'copying' ? (
                  <><Loader2 className="animate-spin" size={14} /> Building prompt...</>
                ) : copyStatus === 'copied' ? (
                  <><CheckCircle2 size={14} /> Copied — paste in Claude</>
                ) : (
                  <><Copy size={14} /> Copy for Claude</>
                )}
              </button>
            </div>
          </div>

          {/* Deterministic result */}
          {result && (
            <div className={`grade-result ${result.passed ? 'passed' : 'failed'}`}>
              <div className="result-header">
                {result.passed ? (
                  <>
                    <CheckCircle2 size={24} />
                    <h2>PASS</h2>
                    {result.detectedFlow && <p style={{color: '#94A3B8', margin: '4px 0 0', fontSize: '13px'}}>Auto-detected: {result.detectedFlow} — {result.detectedDescription}</p>}
                  </>
                ) : (
                  <>
                    <XCircle size={24} />
                    <h2>FAIL</h2>
                    {result.detectedFlow && <p style={{color: '#94A3B8', margin: '4px 0 0', fontSize: '13px'}}>Auto-detected: {result.detectedFlow} — {result.detectedDescription}</p>}
                  </>
                )}
              </div>

              {result.failures.length > 0 && (
                <div className="failures-list">
                  <h3>Failure Reasons:</h3>
                  <ul>
                    {result.failures.map((failure, index) => (
                      <li key={index}>{failure}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTestCase && (
                <div className="test-case-info">
                  <h3>Test Case Details:</h3>
                  <div className="info-grid">
                    <div><strong>ID:</strong> {selectedTestCase.spec.id}</div>
                    <div><strong>Scenario:</strong> {selectedTestCase.spec.scenario_type}</div>
                    <div><strong>Priority:</strong> {selectedTestCase.spec.priority}</div>
                    <div><strong>Goal:</strong> {selectedTestCase.spec.goal}</div>
                    <div><strong>Must say:</strong> {selectedTestCase.spec.must_say.join(', ')}</div>
                    <div><strong>Must not say:</strong> {selectedTestCase.spec.must_not_say.join(', ')}</div>
                    <div><strong>Expected tools:</strong> {selectedTestCase.spec.expected_tools.join(', ')}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Claude verdict section */}
          <div className="llm-section">
            <div className="llm-header">
              <Brain size={18} />
              <h2>Claude verdict</h2>
              <span className="llm-tag">LLM-assisted</span>
            </div>
            <p className="llm-desc">
              After copying the prompt and pasting it in claude.ai, paste Claude JSON response below.
            </p>

            <textarea
              className="llm-input"
              value={claudeJson}
              onChange={(e) => { setClaudeJson(e.target.value); setLlmVerdict(null); setLlmError(''); setLlmSaved(false) }}
              placeholder="Paste Claude JSON response here"
              rows={6}
            />

            {llmError && <div className="llm-error">{llmError}</div>}

            <button
              className="llm-save-btn"
              onClick={handleSaveClaudeVerdict}
              disabled={!claudeJson.trim() || savingLlm}
            >
              {savingLlm ? (
                <><Loader2 className="animate-spin" size={14} /> Saving...</>
              ) : (
                <><ClipboardPaste size={14} /> Parse &amp; save verdict</>
              )}
            </button>

            {llmSaved && <div className="llm-saved">Saved to platform.</div>}

            {llmVerdict && (
              <div className={`llm-result ${llmVerdict.verdict === 'pass' ? 'llm-pass' : 'llm-fail'}`}>
                <div className="llm-result-head">
                  {llmVerdict.verdict === 'pass' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                  <span className="llm-verdict-label">{llmVerdict.verdict.toUpperCase()}</span>
                  {llmVerdict.detected_flow && <span className="llm-flow">Flow: {llmVerdict.detected_flow}</span>}
                  {llmVerdict.confidence != null && <span className="llm-conf">{(llmVerdict.confidence * 100).toFixed(0)}% confidence</span>}
                </div>

                {llmVerdict.summary && (
                  <p className="llm-summary">{llmVerdict.summary}</p>
                )}

                {llmVerdict.failures.length > 0 && (
                  <div className="llm-failures">
                    {llmVerdict.failures.map((f, i) => (
                      <div className="llm-failure-row" key={i}>
                        <span className={`llm-sev llm-sev-${f.severity}`}>{f.severity}</span>
                        <span className="llm-rule">{f.rule}</span>
                        <span className="llm-detail">{f.detail}</span>
                      </div>
                    ))}
                  </div>
                )}

                {llmVerdict.remarks && (
                  <div className="llm-remarks">
                    <strong>New pattern suggestions:</strong> {llmVerdict.remarks}
                  </div>
                )}

                {/* Side-by-side comparison if deterministic result exists */}
                {result && (
                  <div className="llm-compare">
                    <div className="llm-compare-head">Deterministic vs Claude</div>
                    <div className="llm-compare-grid">
                      <div className="llm-compare-cell">
                        <div className="llm-compare-label">Deterministic</div>
                        <div className={`llm-compare-verdict ${result.passed ? 'cmp-pass' : 'cmp-fail'}`}>
                          {result.passed ? 'PASS' : 'FAIL'}
                        </div>
                        <div className="llm-compare-count">{result.failures.length} failure{result.failures.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="llm-compare-cell">
                        <div className="llm-compare-label">Claude</div>
                        <div className={`llm-compare-verdict ${llmVerdict.verdict === 'pass' ? 'cmp-pass' : 'cmp-fail'}`}>
                          {llmVerdict.verdict.toUpperCase()}
                        </div>
                        <div className="llm-compare-count">{llmVerdict.failures.length} failure{llmVerdict.failures.length !== 1 ? 's' : ''}</div>
                      </div>
                      <div className="llm-compare-cell">
                        <div className="llm-compare-label">Agree?</div>
                        <div className={`llm-compare-verdict ${result.passed === (llmVerdict.verdict === 'pass') ? 'cmp-pass' : 'cmp-warn'}`}>
                          {result.passed === (llmVerdict.verdict === 'pass') ? 'YES' : 'NO'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}

const styles = `
:root { --ink: #F8FAFC; --muted-ink: #94A3B8; --line: #334155; --surface: #1E293B; --wash: #0F172A; }
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
* { box-sizing: border-box; }
body { margin: 0; background: var(--wash); color: var(--ink); font-family: var(--geist), Arial, sans-serif; }
button, select, textarea { font: inherit; }
button { cursor: pointer; }
.app-shell { min-height: 100vh; display: flex; background: var(--wash); }
.main-content { flex: 1; padding: 0; display: flex; flex-direction: column; background: #0F172A; }
.topbar { background: #1E293B; border-bottom: 1px solid #334155; padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
.breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #94A3B8; }
.breadcrumb strong { color: #F8FAFC; }
.top-actions { display: flex; align-items: center; gap: 12px; }
.icon-button { background: transparent; border: none; color: #94A3B8; padding: 8px; border-radius: 8px; cursor: pointer; }
.icon-button:hover { background: #334155; color: #F8FAFC; }
.top-avatar { width: 32px; height: 32px; background: #3f7c80; color: white; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.page-wrap { padding: 32px; flex: 1; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; }
.eyebrow { display: flex; align-items: center; gap: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; color: #94A3B8; font-weight: 700; margin-bottom: 8px; }
.page-heading h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; color: #F8FAFC; }
.page-heading p { margin: 0; color: #94A3B8; font-size: 14px; }
.grade-form { max-width: 800px; margin: 20px 0; }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.form-row-full { margin-bottom: 20px; }
.grade-form label { display: block; margin-bottom: 20px; font-size: 12px; font-weight: 600; color: #94A3B8; }
.grade-form label input, .grade-form label select, .grade-form label textarea { width: 100%; padding: 12px; background: #1E293B; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; font-size: 14px; margin-top: 8px; }
.grade-form label select { appearance: none; cursor: pointer; }
.grade-form label textarea { font-family: monospace; resize: vertical; }
.grade-actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.primary-button { background: #F59E0B; color: #0F172A; border: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; min-height: 44px; }
.primary-button:disabled { opacity: 0.5; cursor: not-allowed; }
.auto-grade-btn { background: #22c55e; }
.claude-copy-btn { background: #1E293B; color: #F8FAFC; border: 1px solid #475569; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: flex; align-items: center; gap: 8px; min-height: 44px; }
.claude-copy-btn:hover { border-color: #7C3AED; color: #C4B5FD; }
.claude-copy-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.grade-result { max-width: 800px; margin: 30px 0; padding: 24px; border-radius: 12px; border: 2px solid; }
.grade-result.passed { background: rgba(34, 197, 94, 0.1); border-color: #22c55e; }
.grade-result.failed { background: rgba(239, 68, 68, 0.1); border-color: #ef4444; }
.result-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.result-header h2 { margin: 0; font-size: 24px; font-weight: 700; }
.grade-result.passed .result-header h2 { color: #22c55e; }
.grade-result.failed .result-header h2 { color: #ef4444; }
.failures-list { margin-bottom: 20px; }
.failures-list h3 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.failures-list ul { margin: 0; padding-left: 20px; }
.failures-list li { margin-bottom: 8px; color: #ef4444; }
.test-case-info { padding-top: 20px; border-top: 1px solid #334155; }
.test-case-info h3 { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.info-grid div { font-size: 14px; }
.info-grid strong { color: #94A3B8; }
.llm-section { max-width: 800px; margin: 36px 0; border-top: 1px solid #334155; padding-top: 28px; }
.llm-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.llm-header h2 { margin: 0; font-size: 18px; font-weight: 650; color: #F8FAFC; }
.llm-tag { font-size: 10px; font-weight: 700; background: #7C3AED22; color: #A78BFA; border-radius: 6px; padding: 3px 10px; letter-spacing: 0.04em; }
.llm-desc { font-size: 13px; color: #94A3B8; margin: 4px 0 16px; line-height: 1.55; }
.llm-input { width: 100%; padding: 12px; background: #1E293B; border: 1px solid #475569; color: #F8FAFC; border-radius: 8px; font-size: 13px; font-family: monospace; resize: vertical; margin-bottom: 12px; }
.llm-input:focus { outline: none; border-color: #7C3AED; }
.llm-save-btn { background: #7C3AED; color: #FFFFFF; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; font-size: 13px; display: flex; align-items: center; gap: 8px; min-height: 44px; }
.llm-save-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.llm-error { color: #F87171; font-size: 13px; margin: 8px 0; }
.llm-saved { color: #4ADE80; font-size: 13px; margin: 8px 0; }
.llm-result { margin-top: 20px; background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; border-left: 3px solid #7C3AED; }
.llm-pass { border-left-color: #22c55e; }
.llm-fail { border-left-color: #ef4444; }
.llm-result-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.llm-pass .llm-result-head { color: #22c55e; }
.llm-fail .llm-result-head { color: #ef4444; }
.llm-verdict-label { font-size: 20px; font-weight: 700; }
.llm-flow { font-size: 12px; font-family: monospace; color: #94A3B8; background: #334155; padding: 3px 9px; border-radius: 5px; }
.llm-conf { font-size: 12px; color: #94A3B8; }
.llm-summary { font-size: 14px; color: #E2E8F0; line-height: 1.6; margin: 0 0 16px; }
.llm-failures { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.llm-failure-row { display: flex; align-items: flex-start; gap: 10px; font-size: 13px; padding: 8px 12px; background: #0F172A; border-radius: 6px; }
.llm-sev { font-size: 10px; font-weight: 700; border-radius: 4px; padding: 2px 7px; flex-shrink: 0; margin-top: 2px; }
.llm-sev-critical { background: #EF444425; color: #F87171; }
.llm-sev-major { background: #F59E0B25; color: #FBBF24; }
.llm-sev-minor { background: #334155; color: #94A3B8; }
.llm-rule { font-family: monospace; color: #CBD5E1; flex-shrink: 0; }
.llm-detail { color: #94A3B8; }
.llm-remarks { font-size: 13px; color: #A78BFA; background: #7C3AED12; border: 1px solid #7C3AED33; border-radius: 8px; padding: 10px 14px; line-height: 1.55; margin-top: 12px; }
.llm-remarks strong { color: #C4B5FD; }
.llm-compare { margin-top: 16px; border-top: 1px solid #334155; padding-top: 14px; }
.llm-compare-head { font-size: 12px; font-weight: 600; color: #94A3B8; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px; }
.llm-compare-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
.llm-compare-cell { background: #0F172A; border-radius: 8px; padding: 14px; text-align: center; }
.llm-compare-label { font-size: 11px; color: #94A3B8; margin-bottom: 6px; }
.llm-compare-verdict { font-size: 18px; font-weight: 700; }
.cmp-pass { color: #4ADE80; }
.cmp-fail { color: #F87171; }
.cmp-warn { color: #FBBF24; }
.llm-compare-count { font-size: 11px; color: #64748B; margin-top: 4px; }
.flex { display: flex; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.py-20 { padding-top: 80px; padding-bottom: 80px; }
.ml-2 { margin-left: 8px; }
.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`

if (typeof document !== 'undefined' && !document.getElementById('grade-styles')) {
  const style = document.createElement('style')
  style.id = 'grade-styles'
  style.textContent = styles
  document.head.appendChild(style)
}