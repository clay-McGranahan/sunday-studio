import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { PROVIDER_PRESETS, type AiSettings, type AiSettingsInput } from '@shared/types'
import { paths } from './paths'

interface StoredSettings {
  ai: {
    provider: AiSettings['provider']
    baseUrl: string
    model: string
    /** API key encrypted with the OS keychain (base64), or plain text if encryption is unavailable. */
    key?: string
    keyEncrypted?: boolean
  }
}

const defaults: StoredSettings = {
  ai: { provider: 'openrouter', baseUrl: PROVIDER_PRESETS.openrouter.baseUrl, model: PROVIDER_PRESETS.openrouter.model }
}

function load(): StoredSettings {
  if (!existsSync(paths.settings())) return structuredClone(defaults)
  try {
    const raw = JSON.parse(readFileSync(paths.settings(), 'utf8')) as Partial<StoredSettings>
    return { ai: { ...defaults.ai, ...raw.ai } }
  } catch {
    return structuredClone(defaults)
  }
}

function save(settings: StoredSettings): void {
  writeFileSync(paths.settings(), JSON.stringify(settings, null, 2))
}

export function getAiSettings(): AiSettings {
  const { ai } = load()
  const hasKey = Boolean(ai.key)
  const configured = Boolean(ai.model) && (hasKey || ai.provider === 'custom')
  return { provider: ai.provider, baseUrl: ai.baseUrl, model: ai.model, hasKey, configured }
}

export function getApiKey(): string | null {
  const { ai } = load()
  if (!ai.key) return null
  if (!ai.keyEncrypted) return ai.key
  try {
    return safeStorage.decryptString(Buffer.from(ai.key, 'base64'))
  } catch {
    return null
  }
}

export function setAiSettings(input: AiSettingsInput): AiSettings {
  const settings = load()
  settings.ai.provider = input.provider
  settings.ai.baseUrl = input.baseUrl.trim().replace(/\/+$/, '')
  settings.ai.model = input.model.trim()
  if (input.apiKey !== undefined) {
    const key = input.apiKey.trim()
    if (!key) {
      delete settings.ai.key
      delete settings.ai.keyEncrypted
    } else if (safeStorage.isEncryptionAvailable()) {
      settings.ai.key = safeStorage.encryptString(key).toString('base64')
      settings.ai.keyEncrypted = true
    } else {
      settings.ai.key = key
      settings.ai.keyEncrypted = false
    }
  }
  save(settings)
  return getAiSettings()
}
