import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ProgressEvent, SetupItem, SetupItemId, SetupStatus } from '@shared/types'
import { paths } from './paths'
import { getAiSettings } from './settings'
import { listProjects } from './store'
import {
  envPython,
  ffmpegHasLibass,
  ffmpegPath,
  findOnPath,
  findSystemPython,
  modelCached,
  PARAKEET_MODEL,
  run,
  trackerPath
} from './tools'

type Emit = (event: ProgressEvent) => void

async function parakeetInstalled(): Promise<boolean> {
  if (!existsSync(envPython())) return false
  const { code } = await run(envPython(), ['-c', 'import parakeet_mlx']).catch(() => ({ code: 1 }))
  return code === 0
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const brew = findOnPath('brew')
  const ffmpeg = ffmpegPath()
  const libass = ffmpeg ? await ffmpegHasLibass(ffmpeg) : false
  const systemPython = await findSystemPython()
  const hasEnv = await parakeetInstalled()
  const hasModel = modelCached()
  const tracker = trackerPath()

  const items: SetupItem[] = [
    {
      id: 'ffmpeg',
      label: 'Video tools (FFmpeg)',
      description: 'Reads your sermon video, frames clips and burns in captions.',
      ready: Boolean(ffmpeg && libass),
      detail: !ffmpeg
        ? brew
          ? 'Not found. Sunday Studio can install it with Homebrew.'
          : 'Not found. Install Homebrew (brew.sh) first, then return here.'
        : !libass
          ? 'Found, but this build cannot draw captions (missing libass).'
          : ffmpeg,
      installable: Boolean(brew),
      required: true
    },
    {
      id: 'python',
      label: 'Python 3.10+',
      description: 'Runs the on-device transcription engine.',
      ready: Boolean(systemPython) || hasEnv,
      detail: systemPython ?? (brew ? 'Not found. Sunday Studio can install it with Homebrew.' : 'Install Python from python.org.'),
      installable: Boolean(brew),
      required: true
    },
    {
      id: 'parakeet',
      label: 'Transcription engine (Parakeet)',
      description: 'NVIDIA Parakeet running on your Mac with Apple MLX.',
      ready: hasEnv,
      detail: hasEnv ? paths.pythonEnv() : 'About 300 MB download.',
      installable: Boolean(systemPython) || hasEnv,
      required: true
    },
    {
      id: 'model',
      label: 'Transcription model',
      description: 'Parakeet TDT 0.6B v3, downloaded once and used offline.',
      ready: hasModel,
      detail: hasModel ? PARAKEET_MODEL : 'About 2.5 GB download.',
      installable: hasEnv,
      required: true
    },
    {
      id: 'tracker',
      label: 'Speaker tracking',
      description: 'Keeps the pastor in frame using Apple Vision, on-device.',
      ready: Boolean(tracker),
      detail: tracker ?? (findOnPath('swiftc') ? 'Can be built on this Mac.' : 'Requires Xcode Command Line Tools to build.'),
      installable: Boolean(findOnPath('swiftc')),
      required: false
    }
  ]

  return {
    items,
    ready: items.filter((i) => i.required).every((i) => i.ready),
    aiConfigured: getAiSettings().configured,
    projectCount: listProjects().length,
    dataDir: paths.data()
  }
}

function lastLine(text: string): string {
  return text.trim().split('\n').filter(Boolean).pop() ?? ''
}

async function check(result: Promise<{ code: number; stderr: string; stdout: string }>, what: string) {
  const { code, stderr, stdout } = await result
  if (code !== 0) throw new Error(`${what} failed: ${lastLine(stderr) || lastLine(stdout) || `exit code ${code}`}`)
}

export async function installSetupItem(id: SetupItemId, emit: Emit): Promise<void> {
  const say = (message: string, progress?: number) => emit({ kind: 'setup', item: id, message, progress })
  const brew = findOnPath('brew')

  switch (id) {
    case 'ffmpeg': {
      if (!brew) throw new Error('Homebrew is needed to install FFmpeg. Install it from brew.sh, then try again.')
      say('Installing FFmpeg with Homebrew…')
      await check(run(brew, ['install', 'ffmpeg'], { onLine: (l) => say(l) }), 'Installing FFmpeg')
      return
    }
    case 'python': {
      if (!brew) throw new Error('Install Python 3.12 from python.org, then try again.')
      say('Installing Python with Homebrew…')
      await check(run(brew, ['install', 'python@3.12'], { onLine: (l) => say(l) }), 'Installing Python')
      return
    }
    case 'parakeet': {
      const python = await findSystemPython()
      if (!python) throw new Error('Python 3.10 or newer is needed first.')
      if (!existsSync(envPython())) {
        say('Creating a private Python environment…')
        await check(run(python, ['-m', 'venv', paths.pythonEnv()]), 'Creating the Python environment')
      }
      say('Downloading Parakeet (this can take a few minutes)…')
      await check(
        run(envPython(), ['-m', 'pip', 'install', '--upgrade', '--progress-bar', 'off', 'pip', 'parakeet-mlx'], {
          onLine: (l) => say(l.slice(0, 140))
        }),
        'Installing Parakeet'
      )
      return
    }
    case 'model': {
      say('Downloading the transcription model…', 0)
      const script = [
        'from huggingface_hub import snapshot_download',
        `snapshot_download("${PARAKEET_MODEL}")`,
        'print("done")'
      ].join('\n')
      await check(
        run(envPython(), ['-c', script], {
          env: { ...process.env, HF_HUB_DISABLE_TELEMETRY: '1' },
          onStderr: (chunk) => {
            const pct = [...chunk.matchAll(/(\d{1,3})%/g)].pop()
            if (pct) say('Downloading the transcription model…', Number(pct[1]) / 100)
          }
        }),
        'Downloading the model'
      )
      return
    }
    case 'tracker': {
      const swiftc = findOnPath('swiftc')
      if (!swiftc) throw new Error('Install Xcode Command Line Tools (xcode-select --install), then try again.')
      say('Building the speaker tracker…')
      const outDir = join(paths.data(), 'bin')
      mkdirSync(outDir, { recursive: true })
      await check(
        run(swiftc, ['-O', '-swift-version', '5', paths.resource('swift', 'Tracker.swift'), '-o', join(outDir, 'sunday-tracker')]),
        'Building the tracker'
      )
      return
    }
  }
}
