import OpenAI, { APIConnectionError, APIError, AuthenticationError, BadRequestError, NotFoundError, RateLimitError } from 'openai'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Suggestion, Word } from '@shared/types'
import { buildSuggestRequest, parseSuggestions } from '@shared/suggest'
import { paths } from './paths'
import { getAiSettings, getApiKey } from './settings'

/**
 * Best-effort Local Network consent probe (macOS only).
 *
 * Raw sockets to LAN addresses fail with EHOSTUNREACH until the app has Local
 * Network consent, and they never trigger the system prompt. Connecting once
 * through Network.framework (bundled sunday-lanprobe helper) makes macOS show
 * the "access devices on your local network" prompt; after the user allows
 * it, the regular SDK requests go through. Never throws — a missing binary or
 * denied prompt just means the SDK call below reports the real error.
 */
async function ensureLanAccess(): Promise<void> {
  try {
    const { baseUrl } = getAiSettings()
    const url = new URL(baseUrl)
    if (/^(localhost|127\.|::1)/i.test(url.hostname)) return // loopback needs no consent
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
    if (!url.hostname || !Number.isFinite(port)) return
    const bin = join(paths.resource('bin', 'sunday-lanprobe'))
    if (process.platform !== 'darwin' || !existsSync(bin)) return
    await new Promise<void>((resolve) => {
      execFile(bin, [url.hostname, String(port), '4000'], { timeout: 8000 }, () => resolve())
    })
  } catch {
    // Non-URL base etc: the SDK call below will surface the real problem.
  }
}

function client(): { api: OpenAI; model: string; limit: (n: number) => { max_tokens?: number; max_completion_tokens?: number } } {
  const settings = getAiSettings()
  const apiKey = getApiKey()
  if (!apiKey && settings.provider !== 'custom') throw new Error('Add an AI API key in Settings to get clip suggestions.')
  if (!settings.model) throw new Error('Choose an AI model in Settings.')
  const api = new OpenAI({
    apiKey: apiKey ?? 'not-needed',
    baseURL: settings.baseUrl,
    // NOTE: do NOT route through net.fetch (Chromium network service) — on this
    // machine it fails LAN addresses with ERR_ADDRESS_UNREACHABLE while Node's
    // default fetch (same stack as curl) reaches them fine with no popup needed.
    // Local servers may need to load a model before answering.
    timeout: settings.provider === 'custom' ? 600_000 : 180_000,
    maxRetries: 2,
    defaultHeaders: settings.provider === 'openrouter' ? { 'HTTP-Referer': 'https://sunday.studio', 'X-Title': 'Sunday Studio' } : undefined
  })
  // OpenAI's own API wants max_completion_tokens for its reasoning models; other compatible servers use max_tokens.
  const limit = (n: number) => (settings.provider === 'openai' ? { max_completion_tokens: n } : { max_tokens: n })
  return { api, model: settings.model, limit }
}

function friendlyError(err: unknown): Error {
  if (err instanceof AuthenticationError) return new Error('The AI service rejected the API key. Check it in Settings.')
  if (err instanceof NotFoundError) return new Error('The AI model was not found. Check the model name in Settings.')
  if (err instanceof RateLimitError) return new Error('The AI service is busy or out of credit. Try again in a minute.')
  if (err instanceof APIConnectionError) {
    // LAN servers fail differently from cloud ones. The usual causes are a
    // missing macOS Local Network grant (approve it if the system asked),
    // Wi-Fi roaming, or the server box sleeping.
    const base = getAiSettings().baseUrl
    if (/^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|[^/]*\.local|localhost|127\.)/i.test(base))
      return new Error(
        `Could not reach the LAN server at ${base}. ` +
          'If macOS asked for Local Network access, approve it and try again; otherwise check Wi-Fi and that the server is awake.'
      )
    return new Error('Could not reach the AI service. Check your internet connection.')
  }
  if (err instanceof APIError) return new Error(`The AI service returned an error: ${err.message}`)
  return err instanceof Error ? err : new Error(String(err))
}

export async function testConnection(): Promise<string> {
  await ensureLanAccess()
  const { api, model, limit } = client()
  try {
    const res = await api.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Reply with the single word: ready' }],
      ...limit(256)
    })
    return res.model || model
  } catch (err) {
    throw friendlyError(err)
  }
}

export async function suggestClips(words: Word[], query: string): Promise<Suggestion[]> {
  await ensureLanAccess()
  const { api, model, limit } = client()
  const req = buildSuggestRequest(words, query)

  let text: string
  try {
    const params = { model, messages: req.messages, ...limit(16000) }
    let res: OpenAI.Chat.ChatCompletion
    try {
      res = await api.chat.completions.create({ ...params, response_format: { type: 'json_object' } })
    } catch (err) {
      // Some OpenAI-compatible servers don't support JSON mode; the prompt already asks for JSON.
      if (!(err instanceof BadRequestError)) throw err
      res = await api.chat.completions.create(params)
    }
    text = res.choices[0]?.message?.content ?? ''
  } catch (err) {
    throw friendlyError(err)
  }
  return parseSuggestions(text, words, req)
}
