'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ArrowRight, Save, Settings2, AlertTriangle, Bot as BotIcon, Sparkles, Gavel, Wrench } from 'lucide-react'
import Sidebar from '@/components/Sidebar'

type ModelConfig = {
  provider: 'anthropic' | 'openai_compatible'
  model: string
  baseUrl?: string
  apiKey?: string
}

type Config = {
  generator: ModelConfig
  judge: ModelConfig
  optimizer: ModelConfig
  bot: ModelConfig
}

const defaultConfig: Config = {
  generator: { provider: 'anthropic', model: 'claude-sonnet-5' },
  judge: { provider: 'anthropic', model: 'claude-sonnet-5' },
  optimizer: { provider: 'anthropic', model: 'claude-sonnet-5' },
  bot: { provider: 'anthropic', model: 'claude-sonnet-5' },
}

const anthropicModels = [
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-haiku-4-5',
]

const commonOpenAIModels = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-3.5-turbo',
  'llama3-70b-8192', // Groq
  'llama3-8b-8192', // Groq
  'mixtral-8x7b-32768', // Groq
]

export default function SetupPage() {
  const [config, setConfig] = useState<Config>(defaultConfig)
  const [envStatus, setEnvStatus] = useState<{ hasAnthropicKey: boolean; hasOpenAIKey: boolean }>({
    hasAnthropicKey: false,
    hasOpenAIKey: false,
  })
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  useEffect(() => {
    // Load current configuration
    async function loadConfig() {
      try {
        const res = await fetch('/api/model-config')
        if (res.ok) {
          const data = await res.json()
          if (data.success) {
            setConfig(data.config)
            setEnvStatus({
              hasAnthropicKey: !data.envStatus.missing.includes('ANTHROPIC_API_KEY'),
              hasOpenAIKey: !data.envStatus.missing.includes('OPENAI_API_KEY'),
            })
          }
        }
      } catch (error) {
        console.error('Error loading configuration:', error)
      }
    }
    loadConfig()
  }, [])

  function updateRole(role: keyof Config, field: keyof ModelConfig, value: string) {
    setConfig(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [field]: value,
      },
    }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveStatus('idle')

    try {
      const res = await fetch('/api/model-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.success) {
          setSaveStatus('success')
          setTimeout(() => setSaveStatus('idle'), 3000)
        } else {
          setSaveStatus('error')
        }
      } else {
        setSaveStatus('error')
      }
    } catch (error) {
      console.error('Error saving config:', error)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  function isBotUsingClaude() {
    return config.bot.provider === 'anthropic' && config.bot.model.toLowerCase().includes('claude')
  }

  const roleIcons = {
    generator: <Sparkles size={16} />,
    judge: <Gavel size={16} />,
    optimizer: <Wrench size={16} />,
    bot: <BotIcon size={16} />,
  }

  const roleDescriptions = {
    generator: 'Generates test cases from transcripts and rules',
    judge: 'Scores soft rules (diagnostic only)',
    optimizer: 'Proposes prompt improvements based on failures',
    bot: 'The bot under test (temporary - use Claude for testing)',
  }

  return (
    <main className="app-shell">
      <Sidebar />
      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ArrowRight size={13} /><strong>Model Configuration</strong></div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help"><AlertTriangle size={17} /></button>
            <div className="top-avatar">IA</div>
          </div>
        </header>

        <div className="page-wrap">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><Settings2 size={14} /> Configuration</div>
              <h1>Model Settings</h1>
              <p>
                Configure which AI models to use for each role in the evaluation pipeline.
                Set your API keys in environment variables or locally for development.
              </p>
            </div>
            <button 
              className="primary-button" 
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={15} />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>

          {saveStatus === 'success' && (
            <div className="setup-success">
              <span>Configuration saved successfully!</span>
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="setup-error">
              <span>Failed to save configuration. Please try again.</span>
            </div>
          )}

          {isBotUsingClaude() && (
            <div className="setup-warning">
              <AlertTriangle size={15} />
              <span>
                Bot-under-test is running on Claude. Real bots run on a ~4B Gemma-class model
                which follows instructions less reliably. These results are optimistic.
              </span>
            </div>
          )}

          <div className="setup-grid">
            {(Object.keys(config) as Array<keyof Config>).map((role) => (
              <div key={role} className="setup-card">
                <div className="setup-card-header">
                  <div className="setup-card-icon">{roleIcons[role]}</div>
                  <div>
                    <h3>{role.charAt(0).toUpperCase() + role.slice(1)}</h3>
                    <p>{roleDescriptions[role]}</p>
                  </div>
                </div>

                <div className="setup-card-body">
                  <div className="form-group">
                    <label>Provider</label>
                    <select
                      value={config[role].provider}
                      onChange={(e) => updateRole(role, 'provider', e.target.value as 'anthropic' | 'openai_compatible')}
                    >
                      <option value="anthropic">Anthropic (Claude)</option>
                      <option value="openai_compatible">OpenAI-Compatible</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Model</label>
                    <select
                      value={config[role].model}
                      onChange={(e) => updateRole(role, 'model', e.target.value)}
                    >
                      {config[role].provider === 'anthropic' ? (
                        anthropicModels.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))
                      ) : (
                        commonOpenAIModels.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))
                      )}
                    </select>
                  </div>

                  {config[role].provider === 'openai_compatible' && (
                    <>
                      <div className="form-group">
                        <label>Base URL</label>
                        <input
                          type="text"
                          placeholder="https://api.openai.com/v1"
                          value={config[role].baseUrl || ''}
                          onChange={(e) => updateRole(role, 'baseUrl', e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label>API Key</label>
                        <input
                          type="password"
                          placeholder="sk-..."
                          value={config[role].apiKey || ''}
                          onChange={(e) => updateRole(role, 'apiKey', e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="setup-help">
            <h3>Environment Variables</h3>
            <p>
              For production, set these environment variables instead of using the UI:
            </p>
            <div className="code-block">
              <code>ANTHROPIC_API_KEY=your_key_here</code>
              <code>OPENAI_API_KEY=your_key_here</code>
              <code>OPENAI_BASE_URL=https://api.openai.com/v1</code>
            </div>
            <p>
              Copy <span className="file-ref">.env.example</span> to <span className="file-ref">.env.local</span> and fill in your keys.
            </p>
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
.primary-button:disabled { opacity: 0.6; cursor: not-allowed; }
.setup-success { display: flex; align-items: center; gap: 10px; padding: 13px 15px; margin-bottom: 20px; background: #22C55E14; border: 1px solid #22C55E55; border-radius: 9px; color: #22C55E; font-size: 13px; }
.setup-error { display: flex; align-items: center; gap: 10px; padding: 13px 15px; margin-bottom: 20px; background: #EF444414; border: 1px solid #EF444455; border-radius: 9px; color: #EF4444; font-size: 13px; }
.setup-warning { display: flex; align-items: flex-start; gap: 10px; padding: 13px 15px; margin-bottom: 20px; background: #F59E0B14; border: 1px solid #F59E0B55; border-radius: 9px; color: #FBBF24; font-size: 13px; line-height: 1.55; }
.setup-warning svg { flex: 0 0 auto; margin-top: 2px; }
.setup-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 32px; }
.setup-card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
.setup-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.setup-card-icon { width: 36px; height: 36px; display: grid; place-items: center; background: #3f7c80; color: white; border-radius: 9px; }
.setup-card-header h3 { margin: 0 0 4px; font-size: 15px; font-weight: 650; color: #F8FAFC; }
.setup-card-header p { margin: 0; font-size: 12px; color: #94A3B8; }
.setup-card-body { display: flex; flex-direction: column; gap: 16px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12px; font-weight: 600; color: #94A3B8; }
.form-group select, .form-group input { background: #0F172A; color: #E2E8F0; border: 1px solid #334155; border-radius: 8px; padding: 9px 13px; font-size: 13px; font-family: inherit; }
.form-group select:hover, .form-group input:hover { border-color: #475569; }
.form-group select:focus, .form-group input:focus { outline: none; border-color: #F59E0B; }
.setup-help { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
.setup-help h3 { margin: 0 0 8px; font-size: 15px; font-weight: 650; color: #F8FAFC; }
.setup-help p { margin: 0 0 12px; font-size: 13px; color: #94A3B8; line-height: 1.6; }
.code-block { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }
.code-block code { display: block; background: #0F172A; color: #E2E8F0; padding: 10px 13px; border-radius: 8px; font-family: 'Courier New', monospace; font-size: 12px; border: 1px solid #334155; }
.file-ref { background: #334155; color: #F59E0B; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 11px; }
`

if (typeof document !== 'undefined' && !document.getElementById('setup-styles')) {
  const style = document.createElement('style')
  style.id = 'setup-styles'
  style.textContent = styles
  document.head.appendChild(style)
}