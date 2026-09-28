import type { Project, ProjectDetail, ProgressEvent, RenderRequest, Transcript, Word } from '@shared/types'

/** A video the user picked: a local file path (desktop) or a browser File to upload (cloud). */
export type VideoSource = { kind: 'path'; path: string; name: string } | { kind: 'file'; file: File; name: string }

/** Where a rendered clip ended up: a file on disk (desktop) or a download link (cloud). */
export interface RenderResult {
  name: string
  path?: string
  url?: string
}

export type ProjectPatch = Partial<Pick<Project, 'name' | 'selection' | 'aspect' | 'captionStyle' | 'tracking'>>
export type ProjectRow = Project & { processing?: boolean }

/**
 * Everything the projects and editor screens need from wherever the work happens.
 * The desktop app talks to its Electron main process; the cloud web app talks to its server.
 */
export interface Backend {
  kind: 'desktop' | 'cloud'
  /** Words for where projects live, e.g. "on this Mac" or "in your account". */
  storageLabel: string
  /** Label for the action that opens a finished clip, e.g. "Show in Finder" or "Download". */
  resultActionLabel: string

  listProjects(): Promise<ProjectRow[]>
  getProject(id: string): Promise<ProjectDetail>
  chooseVideo(): Promise<VideoSource | null>
  sourceFromFile(file: File): VideoSource
  createProject(source: VideoSource, onUploadProgress?: (fraction: number) => void): Promise<Project>
  retryProject(id: string): Promise<void>
  cancelProject(id: string): Promise<void>
  updateProject(id: string, patch: ProjectPatch): Promise<Project>
  deleteProject(id: string): Promise<void>

  saveTranscript(id: string, words: Word[]): Promise<Transcript>
  aiAvailable(): Promise<boolean>
  suggest(id: string, query: string): Promise<Project>
  removeSuggestion(id: string, suggestionId: string): Promise<Project>
  track(id: string, startWord: number, endWord: number): Promise<Project>
  render(req: Omit<RenderRequest, 'outputPath'>, title: string): Promise<RenderResult | null>
  cancelRender(): Promise<void>
  openResult(result: RenderResult): void

  videoUrl(id: string): string
  thumbUrl(id: string, version?: string): string
  onProgress(fn: (e: ProgressEvent) => void): () => void
}

let current: Backend | null = null

/** Choose the backend before the first render (the cloud web app calls this at startup). */
export function setBackend(backend: Backend): void {
  current = backend
}

/** The active backend. Screens import this; calls go to whichever backend was set. */
export const api: Backend = new Proxy({} as Backend, {
  get(_, key) {
    if (!current) throw new Error('No backend configured.')
    return current[key as keyof Backend]
  }
})
