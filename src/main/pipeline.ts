import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Project, ProgressEvent, Transcript } from '@shared/types'
import { paths } from './paths'
import { listProjects, readProject, readTranscript, thumbnailFile, updateProject, writeProject, writeTranscript } from './store'
import { envPython, PARAKEET_MODEL, requireFfmpeg, run } from './tools'

type Emit = (event: ProgressEvent) => void

const SUPPORTED = new Set(['.mp4', '.mov', '.webm', '.m4v'])
const MAX_SECONDS = 3.25 * 3600

interface Probe {
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

export async function probe(file: string): Promise<Probe> {
  const { ffprobe } = requireFfmpeg()
  const { code, stdout } = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])
  if (code !== 0) throw new Error('This file could not be read as a video.')
  const data = JSON.parse(stdout) as {
    format: { duration?: string }
    streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[]
  }
  const video = data.streams.find((s) => s.codec_type === 'video')
  if (!video?.width || !video.height) throw new Error('No video track was found in this file.')
  const [num, den] = (video.avg_frame_rate ?? '30/1').split('/').map(Number)
  const rotation = Math.abs(Number(video.tags?.rotate ?? video.side_data_list?.[0]?.rotation ?? 0))
  const rotated = rotation === 90 || rotation === 270
  return {
    duration: Number(data.format.duration ?? 0),
    width: rotated ? video.height : video.width,
    height: rotated ? video.width : video.height,
    fps: den ? num / den : 30,
    hasAudio: data.streams.some((s) => s.codec_type === 'audio')
  }
}

export async function createProject(sourcePath: string, emit: Emit): Promise<Project> {
  if (!SUPPORTED.has(extname(sourcePath).toLowerCase())) {
    throw new Error('Please choose an MP4, MOV or WebM video.')
  }
  const info = await probe(sourcePath)
  if (!info.hasAudio) throw new Error('This video has no sound, so there is nothing to transcribe.')
  if (info.duration > MAX_SECONDS) throw new Error('This video is longer than 3 hours. Please trim it first.')

  const id = randomUUID()
  paths.project(id)
  const now = new Date().toISOString()
  const project: Project = writeProject({
    id,
    name: basename(sourcePath, extname(sourcePath)).replace(/[_-]+/g, ' ').trim(),
    sourcePath,
    sourceName: basename(sourcePath),
    sourceSize: statSync(sourcePath).size,
    duration: info.duration,
    width: info.width,
    height: info.height,
    fps: info.fps,
    createdAt: now,
    updatedAt: now,
    status: 'queued',
    suggestions: [],
    aspect: '9:16',
    captionStyle: 'clean'
  })

  void processProject(id, emit)
  return project
}

const running = new Map<string, AbortController>()

export function isProcessing(id: string): boolean {
  return running.has(id)
}

export function cancelProcessing(id: string): void {
  running.get(id)?.abort()
}

/** Prepare audio and transcribe. Safe to call again to retry a failed project. */
export async function processProject(id: string, emit: Emit): Promise<void> {
  if (running.has(id)) return
  const controller = new AbortController()
  running.set(id, controller)
  const set = (patch: Partial<Project>) => {
    const p = updateProject(id, patch)
    emit({ kind: 'project', projectId: id, status: p.status, progress: p.progress, message: p.statusMessage })
  }
  const audio = join(paths.project(id), 'audio.wav')

  try {
    const project = readProject(id)!
    if (!existsSync(project.sourcePath)) throw new Error(`The original video was moved or deleted (${project.sourcePath}).`)
    const { ffmpeg } = requireFfmpeg()

    set({ status: 'preparing', progress: 0, statusMessage: 'Preparing the video' })
    if (!existsSync(thumbnailFile(id))) {
      await run(ffmpeg, ['-v', 'error', '-y', '-ss', String(Math.min(project.duration * 0.15, 120)), '-i', project.sourcePath,
        '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', thumbnailFile(id)])
    }

    const extract = await run(
      ffmpeg,
      ['-v', 'error', '-y', '-progress', 'pipe:1', '-nostats', '-i', project.sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', audio],
      {
        signal: controller.signal,
        onLine: (line) => {
          const m = /^out_time_us=(\d+)/.exec(line)
          if (m && project.duration) {
            const progress = Math.min(1, Number(m[1]) / 1e6 / project.duration)
            emit({ kind: 'project', projectId: id, status: 'preparing', progress, message: 'Preparing the audio' })
          }
        }
      }
    )
    if (controller.signal.aborted) throw new Error('Cancelled.')
    if (extract.code !== 0) throw new Error('The audio could not be read from this video.')

    set({ status: 'transcribing', progress: 0, statusMessage: 'Loading the transcription model' })
    if (!existsSync(envPython())) throw new Error('The transcription engine is not installed. Open Settings to set it up.')
    const out = join(paths.project(id), 'transcript.raw.json')
    let failure = ''
    const result = await run(envPython(), [paths.resource('python', 'transcribe.py'), audio, out, PARAKEET_MODEL], {
      signal: controller.signal,
      env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1' },
      onLine: (line) => {
        try {
          const event = JSON.parse(line) as { type: string; value?: number; message?: string }
          if (event.type === 'progress') {
            emit({ kind: 'project', projectId: id, status: 'transcribing', progress: event.value, message: 'Transcribing' })
          } else if (event.type === 'stage') {
            emit({ kind: 'project', projectId: id, status: 'transcribing', progress: 0, message: event.message })
          } else if (event.type === 'error') {
            failure = event.message ?? ''
          }
        } catch {
          /* non-JSON output from libraries */
        }
      }
    })
    if (controller.signal.aborted) throw new Error('Cancelled.')
    if (result.code !== 0 || !existsSync(out)) {
      throw new Error(`Transcription failed${failure ? `: ${failure}` : '.'}`)
    }

    const transcript = JSON.parse(readFileSync(out, 'utf8')) as Transcript
    if (!transcript.words.length) throw new Error('No speech was found in this video.')
    const remapped = remapToTranscript(id, transcript)
    writeTranscript(id, transcript)
    rmSync(out, { force: true })
    set({ status: 'ready', progress: 1, statusMessage: undefined, wordCount: transcript.words.length, ...remapped })
  } catch (err) {
    set({ status: 'error', progress: undefined, statusMessage: err instanceof Error ? err.message : String(err) })
  } finally {
    rmSync(audio, { force: true })
    running.delete(id)
  }
}

/** Nearest word index to a time, for carrying selections across a re-transcription. */
function wordNear(words: Transcript['words'], t: number, edge: 'start' | 'end'): number {
  let best = 0
  let bestDist = Infinity
  words.forEach((w, i) => {
    const d = Math.abs((edge === 'start' ? w.start : w.end) - t)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  })
  return best
}

/** Word indices change when a sermon is transcribed again; keep the selection and suggestions on the same moments. */
function remapToTranscript(id: string, next: Transcript): Partial<Project> {
  const previous = readTranscript(id)
  const project = readProject(id)
  if (!previous || !project) return {}
  const map = (startWord: number, endWord: number) => {
    const a = previous.words[startWord]
    const b = previous.words[endWord]
    if (!a || !b) return null
    const s = wordNear(next.words, a.start, 'start')
    return { startWord: s, endWord: Math.max(s, wordNear(next.words, b.end, 'end')) }
  }
  return {
    selection: project.selection ? (map(project.selection.startWord, project.selection.endWord) ?? undefined) : undefined,
    suggestions: project.suggestions.flatMap((sug) => {
      const m = map(sug.startWord, sug.endWord)
      return m ? [{ ...sug, ...m, start: next.words[m.startWord].start, end: next.words[m.endWord].end }] : []
    })
  }
}

/** Projects left mid-processing by a quit or crash can't resume; mark them so the user can retry. */
export function recoverInterruptedProjects(): void {
  for (const p of listProjects()) {
    if (p.status === 'queued' || p.status === 'preparing' || p.status === 'transcribing') {
      updateProject(p.id, { status: 'error', progress: undefined, statusMessage: 'Processing was interrupted. Try again.' })
    }
  }
}
