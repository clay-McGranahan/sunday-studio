import { spawn, type SpawnOptions } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { paths } from './paths'

export const PARAKEET_MODEL = 'mlx-community/parakeet-tdt-0.6b-v3'

// Apps launched from Finder don't inherit the shell PATH, so look in the usual places too.
const EXTRA_BIN_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
export const toolEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: [...EXTRA_BIN_DIRS, process.env.PATH ?? ''].join(':')
})

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

/** Run a command, optionally streaming stdout lines and stderr chunks. */
export function run(
  cmd: string,
  args: string[],
  opts: SpawnOptions & {
    onLine?: (line: string) => void
    onStderr?: (chunk: string) => void
    signal?: AbortSignal
  } = {}
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: toolEnv(), ...opts, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let buffer = ''
    child.stdout!.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stdout += text
      if (opts.onLine) {
        buffer += text
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach((l) => l.trim() && opts.onLine!(l))
      }
    })
    child.stderr!.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr = (stderr + text).slice(-20000)
      opts.onStderr?.(text)
    })
    opts.signal?.addEventListener('abort', () => child.kill('SIGTERM'))
    child.on('error', reject)
    child.on('close', (code) => {
      if (buffer.trim() && opts.onLine) opts.onLine(buffer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

function firstExisting(candidates: string[]): string | null {
  return candidates.find((c) => existsSync(c)) ?? null
}

export function findOnPath(name: string): string | null {
  const dirs = [...EXTRA_BIN_DIRS, ...(process.env.PATH ?? '').split(':')]
  return firstExisting(dirs.filter(Boolean).map((d) => join(d, name)))
}

export function ffmpegPath(): string | null {
  return firstExisting([paths.resource('bin', 'ffmpeg')]) ?? findOnPath('ffmpeg')
}

export function ffprobePath(): string | null {
  return firstExisting([paths.resource('bin', 'ffprobe')]) ?? findOnPath('ffprobe')
}

export function requireFfmpeg(): { ffmpeg: string; ffprobe: string } {
  const ffmpeg = ffmpegPath()
  const ffprobe = ffprobePath()
  if (!ffmpeg || !ffprobe) throw new Error('The video tools (FFmpeg) are not installed. Open Settings to set them up.')
  return { ffmpeg, ffprobe }
}

export async function ffmpegHasLibass(ffmpeg: string): Promise<boolean> {
  const { stdout } = await run(ffmpeg, ['-hide_banner', '-filters'])
  return /\bass\b/.test(stdout)
}

/** A system Python 3.10+ to build the transcription environment from. */
export async function findSystemPython(): Promise<string | null> {
  const candidates = [
    ...['3.13', '3.12', '3.11', '3.10'].flatMap((v) => [
      `/opt/homebrew/bin/python${v}`,
      `/usr/local/bin/python${v}`,
      `/Library/Frameworks/Python.framework/Versions/${v}/bin/python3`
    ]),
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3'
  ].filter((c) => existsSync(c))
  for (const python of candidates) {
    const { code, stdout } = await run(python, ['-c', 'import sys; print(sys.version_info >= (3, 10))']).catch(() => ({
      code: 1,
      stdout: ''
    }))
    if (code === 0 && stdout.trim() === 'True') return python
  }
  return null
}

export function envPython(): string {
  return join(paths.pythonEnv(), 'bin', 'python3')
}

export function modelCached(model = PARAKEET_MODEL): boolean {
  const hub = process.env.HF_HOME ? join(process.env.HF_HOME, 'hub') : join(homedir(), '.cache', 'huggingface', 'hub')
  const snapshots = join(hub, `models--${model.replace('/', '--')}`, 'snapshots')
  if (!existsSync(snapshots)) return false
  return readdirSync(snapshots).some((snap) => {
    const files = readdirSync(join(snapshots, snap))
    return files.some((f) => f.endsWith('.safetensors')) && files.includes('config.json')
  })
}

export function trackerPath(): string | null {
  return firstExisting([paths.resource('bin', 'sunday-tracker'), join(paths.data(), 'bin', 'sunday-tracker')])
}
