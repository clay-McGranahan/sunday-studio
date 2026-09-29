import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { basename, extname, join } from 'node:path'
import { homedir } from 'node:os'
import type { AiSettingsInput, Project, ProgressEvent, RenderRequest, SetupItemId, Word } from '@shared/types'
import { testConnection, suggestClips } from './ai'
import { cancelProcessing, createProject, isProcessing, processProject } from './pipeline'
import { renderClip } from './render'
import { clipBounds } from '@shared/framing'
import { sanitizeCaptionOptions } from '@shared/transcript'
import { getAiSettings, setAiSettings } from './settings'
import { getSetupStatus, installSetupItem } from './setup'
import { deleteProject, getProjectDetail, listProjects, readTranscript, updateProject, writeTranscript } from './store'
import { trackSpeaker } from './tracking'

function broadcast(event: ProgressEvent): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('progress', event)
}

/** Wrap handlers so the renderer receives a plain-language message instead of an IPC stack trace. */
function handle<A extends unknown[], R>(channel: string, fn: (...args: A) => Promise<R> | R): void {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, value: await fn(...(args as A)) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

// Only these fields may be changed directly from the UI.
type ProjectPatch = Pick<Partial<Project>, 'name' | 'selection' | 'aspect' | 'captionStyle' | 'captionOptions' | 'tracking'>

let renderAbort: AbortController | null = null

export function registerIpc(): void {
  handle('setup:status', () => getSetupStatus())
  handle('setup:install', (id: SetupItemId) => installSetupItem(id, broadcast))

  handle('settings:getAi', () => getAiSettings())
  handle('settings:setAi', (input: AiSettingsInput) => setAiSettings(input))
  handle('ai:test', () => testConnection())

  handle('projects:list', () => listProjects().map((p) => ({ ...p, processing: isProcessing(p.id) })))
  handle('projects:get', (id: string) => getProjectDetail(id))
  handle('projects:pickVideo', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose a sermon video',
      properties: ['openFile'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'webm', 'm4v'] }]
    })
    return res.canceled ? null : res.filePaths[0]
  })
  handle('projects:create', (path: string) => createProject(path, broadcast))
  handle('projects:retry', (id: string) => {
    void processProject(id, broadcast)
  })
  handle('projects:cancel', (id: string) => cancelProcessing(id))
  handle('projects:update', (id: string, patch: ProjectPatch) => {
    const allowed: ProjectPatch = {}
    for (const key of ['name', 'selection', 'aspect', 'captionStyle', 'captionOptions', 'tracking'] as const) {
      if (key in patch) (allowed as Record<string, unknown>)[key] = patch[key]
    }
    if ('captionOptions' in patch) allowed.captionOptions = sanitizeCaptionOptions(patch.captionOptions)
    return updateProject(id, allowed)
  })
  handle('suggestions:remove', (id: string, suggestionId: string) => {
    const { project } = getProjectDetail(id)
    return updateProject(id, { suggestions: project.suggestions.filter((s) => s.id !== suggestionId) })
  })
  handle('projects:delete', (id: string) => {
    cancelProcessing(id)
    deleteProject(id)
  })

  handle('transcript:save', (id: string, words: Word[]) => {
    const transcript = readTranscript(id)
    if (!transcript) throw new Error('This project has no transcript yet.')
    if (words.length !== transcript.words.length) throw new Error('The transcript changed unexpectedly. Reopen the project.')
    // Only the text may change; timing always comes from the original transcription.
    transcript.words = transcript.words.map((w, i) => {
      const text = words[i].text.trim()
      if (!text || text === w.text) return w
      return { ...w, text, original: w.original ?? w.text }
    })
    writeTranscript(id, transcript)
    return transcript
  })

  handle('ai:suggest', async (id: string, query: string) => {
    const transcript = readTranscript(id)
    if (!transcript) throw new Error('This project has no transcript yet.')
    const fresh = await suggestClips(transcript.words, query)
    const { project } = getProjectDetail(id)
    // Newest first; the library keeps earlier results unless the exact same moment came back.
    const kept = project.suggestions.filter((old) => !fresh.some((n) => n.startWord === old.startWord && n.endWord === old.endWord))
    return updateProject(id, { suggestions: [...fresh, ...kept], suggestionQuery: query })
  })

  handle('tracking:run', async (id: string, startWord: number, endWord: number) => {
    const { project, transcript } = getProjectDetail(id)
    if (!transcript) throw new Error('This project has no transcript yet.')
    const { start, end } = clipBounds(transcript.words, startWord, endWord, project.duration)
    const tracking = await trackSpeaker(project.sourcePath, start, end, (progress) => broadcast({ kind: 'tracking', progress }))
    return updateProject(id, { tracking })
  })

  handle('render:start', async (req: Omit<RenderRequest, 'outputPath'>, title: string) => {
    const { project } = getProjectDetail(req.projectId)
    const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60)
    const suggested = `${safe(project.name) || basename(project.sourceName, extname(project.sourceName))} – ${safe(title) || 'clip'} (${req.aspect.replace(':', 'x')}).mp4`
    // SUNDAY_EXPORT_DIR skips the dialog (automated tests).
    const res = process.env.SUNDAY_EXPORT_DIR
      ? { canceled: false, filePath: join(process.env.SUNDAY_EXPORT_DIR, suggested) }
      : await dialog.showSaveDialog({
          title: 'Save clip',
          defaultPath: join(homedir(), 'Downloads', suggested),
          filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
        })
    if (res.canceled || !res.filePath) return null
    renderAbort = new AbortController()
    try {
      await renderClip({ ...req, outputPath: res.filePath }, (progress) => broadcast({ kind: 'render', progress }), renderAbort.signal)
    } finally {
      renderAbort = null
    }
    return res.filePath
  })
  handle('render:cancel', () => renderAbort?.abort())

  handle('shell:reveal', (path: string) => shell.showItemInFolder(path))
  handle('shell:openData', async () => {
    const status = await getSetupStatus()
    await shell.openPath(status.dataDir)
  })
}
