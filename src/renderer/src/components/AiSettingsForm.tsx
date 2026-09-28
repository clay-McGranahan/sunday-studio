import { useEffect, useState } from 'react'
import { PROVIDER_PRESETS, type AiSettings } from '@shared/types'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { Spinner } from './Common'

export default function AiSettingsForm({ onSaved }: { onSaved?: (s: AiSettings) => void }) {
  const toast = useToast()
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [provider, setProvider] = useState<AiSettings['provider']>('openrouter')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [key, setKey] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [tested, setTested] = useState<string | null>(null)

  useEffect(() => {
    api.getAi().then((s) => {
      setSettings(s)
      setProvider(s.provider)
      setBaseUrl(s.baseUrl)
      setModel(s.model)
    }, toast.error)
  }, [toast.error])

  const chooseProvider = (p: AiSettings['provider']) => {
    setProvider(p)
    setBaseUrl(PROVIDER_PRESETS[p].baseUrl)
    setModel(PROVIDER_PRESETS[p].model)
    setTested(null)
  }

  const save = async () => {
    setSaving(true)
    try {
      const next = await api.setAi({ provider, baseUrl, model, apiKey: key ? key : undefined })
      setSettings(next)
      setKey('')
      onSaved?.(next)
      return next
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTested(null)
    try {
      await save()
      const served = await api.testAi()
      setTested(served)
      toast.show(`Connected to ${served}`, 'success')
    } catch (err) {
      toast.error(err)
    } finally {
      setTesting(false)
    }
  }

  const removeKey = async () => {
    const next = await api.setAi({ provider, baseUrl, model, apiKey: '' })
    setSettings(next)
    setTested(null)
    onSaved?.(next)
    toast.show('API key removed')
  }

  if (!settings) return <Spinner />

  return (
    <div className="form">
      <div className="field">
        <label>Provider</label>
        <div className="segmented">
          {(Object.keys(PROVIDER_PRESETS) as AiSettings['provider'][]).map((p) => (
            <button key={p} className={provider === p ? 'active' : ''} onClick={() => chooseProvider(p)}>
              {PROVIDER_PRESETS[p].label}
            </button>
          ))}
        </div>
        <p className="hint">
          Any OpenAI-compatible service works. OpenRouter gives you access to models from many providers with one key.
        </p>
      </div>
      <div className="field">
        <label htmlFor="ai-key">API key</label>
        <div className="row">
          <input
            id="ai-key"
            type="password"
            placeholder={
              settings.hasKey
                ? '•••••••••••• saved in your keychain'
                : provider === 'openrouter'
                  ? 'sk-or-…'
                  : provider === 'custom'
                    ? 'Optional for local servers'
                    : 'sk-…'
            }
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setTested(null)
            }}
            autoComplete="off"
            spellCheck={false}
          />
          {settings.hasKey && (
            <button className="btn btn-ghost btn-small" onClick={removeKey}>
              Remove
            </button>
          )}
        </div>
      </div>
      <div className="field">
        <label htmlFor="ai-model">Model</label>
        <input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} placeholder="provider/model-name" />
      </div>
      {provider === 'custom' && (
        <div className="field">
          <label htmlFor="ai-url">Base URL</label>
          <input id="ai-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} spellCheck={false} />
        </div>
      )}
      <div className="row">
        <button className="btn" onClick={() => save().then(() => toast.show('Settings saved', 'success'), toast.error)} disabled={saving || testing}>
          Save
        </button>
        <button className="btn btn-primary" onClick={test} disabled={testing || (!key && !settings.hasKey && provider !== 'custom') || !model.trim()}>
          {testing ? (
            <>
              <Spinner /> Testing…
            </>
          ) : (
            'Test connection'
          )}
        </button>
        {tested && <span className="ok-text">✓ Working</span>}
      </div>
      <p className="hint">Only the transcript text is sent, and only when you ask for suggestions. Your video never leaves this Mac.</p>
    </div>
  )
}
