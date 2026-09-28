import type {
  AiSettings,
  AiSettingsInput,
  Project,
  ProjectDetail,
  ProgressEvent,
  RenderRequest,
  SetupItemId,
  SetupStatus,
  Transcript,
  Word
} from '@shared/types'

const call = <T,>(channel: string, ...args: unknown[]) => window.sunday.invoke<T>(channel, ...args)

export const api = {
  setupStatus: () => call<SetupStatus>('setup:status'),
  install: (id: SetupItemId) => call<void>('setup:install', id),

  getAi: () => call<AiSettings>('settings:getAi'),
  setAi: (input: AiSettingsInput) => call<AiSettings>('settings:setAi', input),
  testAi: () => call<string>('ai:test'),

  listProjects: () => call<(Project & { processing: boolean })[]>('projects:list'),
  getProject: (id: string) => call<ProjectDetail>('projects:get', id),
  pickVideo: () => call<string | null>('projects:pickVideo'),
  createProject: (path: string) => call<Project>('projects:create', path),
  retryProject: (id: string) => call<void>('projects:retry', id),
  cancelProject: (id: string) => call<void>('projects:cancel', id),
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'selection' | 'aspect' | 'captionStyle' | 'tracking'>>) =>
    call<Project>('projects:update', id, patch),
  deleteProject: (id: string) => call<void>('projects:delete', id),

  saveTranscript: (id: string, words: Word[]) => call<Transcript>('transcript:save', id, words),
  suggest: (id: string, query: string) => call<Project>('ai:suggest', id, query),
  removeSuggestion: (id: string, suggestionId: string) => call<Project>('suggestions:remove', id, suggestionId),
  track: (id: string, startWord: number, endWord: number) => call<Project>('tracking:run', id, startWord, endWord),
  render: (req: Omit<RenderRequest, 'outputPath'>, title: string) => call<string | null>('render:start', req, title),
  cancelRender: () => call<void>('render:cancel'),

  reveal: (path: string) => call<void>('shell:reveal', path),
  openDataFolder: () => call<void>('shell:openData'),

  onProgress: (fn: (e: ProgressEvent) => void) => window.sunday.onProgress(fn),
  pathForFile: (file: File) => window.sunday.pathForFile(file)
}

export const videoUrl = (id: string) => `sunday-media://video/${encodeURIComponent(id)}`
export const thumbUrl = (id: string, version = '') => `sunday-media://thumb/${encodeURIComponent(id)}?v=${version}`
