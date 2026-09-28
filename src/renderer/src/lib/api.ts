import type {
  AiSettings,
  AiSettingsInput,
  Project,
  ProjectDetail,
  RenderRequest,
  SetupItemId,
  SetupStatus,
  Transcript,
  Word
} from '@shared/types'
import { setBackend, type Backend, type ProjectRow } from './backend'

export { api, setBackend } from './backend'
export type { Backend, RenderResult, VideoSource } from './backend'

const call = <T,>(channel: string, ...args: unknown[]) => window.sunday.invoke<T>(channel, ...args)

/** Desktop-only calls: on-device setup, AI settings and the local data folder. */
export const desktop = {
  setupStatus: () => call<SetupStatus>('setup:status'),
  install: (id: SetupItemId) => call<void>('setup:install', id),
  getAi: () => call<AiSettings>('settings:getAi'),
  setAi: (input: AiSettingsInput) => call<AiSettings>('settings:setAi', input),
  testAi: () => call<string>('ai:test'),
  openDataFolder: () => call<void>('shell:openData'),
  onProgress: window.sunday ? window.sunday.onProgress : () => () => {}
}

/** The Electron backend: everything runs in the main process on this Mac. */
export const desktopBackend: Backend = {
  kind: 'desktop',
  storageLabel: 'stored on this Mac',
  resultActionLabel: 'Show in Finder',

  listProjects: () => call<ProjectRow[]>('projects:list'),
  getProject: (id) => call<ProjectDetail>('projects:get', id),
  chooseVideo: async () => {
    const path = await call<string | null>('projects:pickVideo')
    return path ? { kind: 'path', path, name: path.split('/').pop() ?? path } : null
  },
  sourceFromFile: (file) => ({ kind: 'path', path: window.sunday.pathForFile(file), name: file.name }),
  createProject: (source) => {
    if (source.kind !== 'path') throw new Error('The desktop app opens videos from disk.')
    return call<Project>('projects:create', source.path)
  },
  retryProject: (id) => call<void>('projects:retry', id),
  cancelProject: (id) => call<void>('projects:cancel', id),
  updateProject: (id, patch) => call<Project>('projects:update', id, patch),
  deleteProject: (id) => call<void>('projects:delete', id),

  saveTranscript: (id, words) => call<Transcript>('transcript:save', id, words),
  aiAvailable: async () => (await call<AiSettings>('settings:getAi')).configured,
  suggest: (id, query) => call<Project>('ai:suggest', id, query),
  removeSuggestion: (id, suggestionId) => call<Project>('suggestions:remove', id, suggestionId),
  track: (id, startWord, endWord) => call<Project>('tracking:run', id, startWord, endWord),
  render: async (req: Omit<RenderRequest, 'outputPath'>, title: string) => {
    const path = await call<string | null>('render:start', req, title)
    return path ? { name: path.split('/').pop() ?? path, path } : null
  },
  cancelRender: () => call<void>('render:cancel'),
  openResult: (result) => {
    if (result.path) void call<void>('shell:reveal', result.path)
  },

  videoUrl: (id) => `sunday-media://video/${encodeURIComponent(id)}`,
  thumbUrl: (id, version = '') => `sunday-media://thumb/${encodeURIComponent(id)}?v=${version}`,
  onProgress: (fn) => window.sunday.onProgress(fn)
}

// The desktop build uses the Electron backend unless something else was chosen first.
if (typeof window !== 'undefined' && window.sunday) setBackend(desktopBackend)
