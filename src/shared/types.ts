export interface Word {
  text: string
  start: number
  end: number
  confidence?: number
  /** Present when the user corrected this word; holds what Parakeet heard. */
  original?: string
}

export interface Transcript {
  model: string
  words: Word[]
  duration: number
}

export type ProjectStatus = 'queued' | 'preparing' | 'transcribing' | 'ready' | 'error'

export interface Selection {
  /** Inclusive word indices. */
  startWord: number
  endWord: number
}

export interface Suggestion {
  id: string
  title: string
  reason: string
  score: number
  startWord: number
  endWord: number
  start: number
  end: number
  /** The request that produced it, for the clip library. */
  query: string
  createdAt: string
}

export type Aspect = '9:16' | '1:1' | '16:9'
export type CaptionStyle = 'clean' | 'punch' | 'minimal'

/** Horizontal/vertical centre of the crop window over time, normalised 0–1 of the source frame. */
export interface TrackPoint {
  t: number
  x: number
  y: number
}

export interface Tracking {
  start: number
  end: number
  points: TrackPoint[]
  /** How many sampled frames had a person detected. */
  coverage: number
}

export interface Project {
  id: string
  name: string
  sourcePath: string
  sourceName: string
  sourceSize: number
  duration: number
  width: number
  height: number
  fps: number
  createdAt: string
  updatedAt: string
  status: ProjectStatus
  statusMessage?: string
  progress?: number
  wordCount?: number
  suggestionQuery?: string
  suggestions: Suggestion[]
  selection?: Selection
  aspect: Aspect
  captionStyle: CaptionStyle
  tracking?: Tracking
}

export interface ProjectDetail {
  project: Project
  transcript: Transcript | null
}

export type SetupItemId = 'ffmpeg' | 'python' | 'parakeet' | 'model' | 'tracker'

export interface SetupItem {
  id: SetupItemId
  label: string
  description: string
  ready: boolean
  detail?: string
  /** Whether the app can install it itself. */
  installable: boolean
  required: boolean
}

export interface SetupStatus {
  items: SetupItem[]
  ready: boolean
  aiConfigured: boolean
  projectCount: number
  dataDir: string
}

export interface AiSettings {
  provider: 'openrouter' | 'openai' | 'custom'
  baseUrl: string
  model: string
  hasKey: boolean
  /** Ready to request suggestions (local servers such as llama.cpp need no key). */
  configured: boolean
}

export interface AiSettingsInput {
  provider: AiSettings['provider']
  baseUrl: string
  model: string
  /** Undefined keeps the stored key; empty string clears it. */
  apiKey?: string
}

export interface RenderRequest {
  projectId: string
  startWord: number
  endWord: number
  aspect: Aspect
  captionStyle: CaptionStyle
  tracking?: Tracking
  outputPath: string
}

export type ProgressEvent =
  | { kind: 'project'; projectId: string; status: ProjectStatus; progress?: number; message?: string }
  | { kind: 'setup'; item: SetupItemId; progress?: number; message: string }
  | { kind: 'render'; progress: number }
  | { kind: 'tracking'; progress: number }

export const MAX_CLIP_SECONDS = 180

export const PROVIDER_PRESETS: Record<AiSettings['provider'], { baseUrl: string; model: string; label: string }> = {
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-sonnet-5' },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.5' },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: 'http://localhost:11434/v1', model: '' }
}
