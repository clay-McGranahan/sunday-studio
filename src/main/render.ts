import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RenderRequest } from '@shared/types'
import { planRender, progressFromLine } from '@shared/render'
import { createFontMeasurer } from '@shared/fontMeasureNode'
import { paths } from './paths'
import { readProject, readTranscript } from './store'
import { requireFfmpeg, run } from './tools'

export async function renderClip(req: RenderRequest, onProgress: (p: number) => void, signal?: AbortSignal): Promise<void> {
  const project = readProject(req.projectId)
  const transcript = readTranscript(req.projectId)
  if (!project || !transcript) throw new Error('This project is missing its transcript.')
  const { ffmpeg } = requireFfmpeg()

  const work = mkdtempSync(join(tmpdir(), 'sunday-render-'))
  try {
    const plan = planRender({
      source: project.sourcePath,
      sourceWidth: project.width,
      sourceHeight: project.height,
      sourceDuration: project.duration,
      words: transcript.words,
      startWord: req.startWord,
      endWord: req.endWord,
      aspect: req.aspect,
      captionStyle: req.captionStyle,
      captionOptions: req.captionOptions,
      measure: createFontMeasurer(paths.resource('fonts')),
      tracking: req.tracking,
      outputPath: req.outputPath,
      workDir: work,
      fontsDir: paths.resource('fonts')
    })
    for (const [name, contents] of Object.entries(plan.files)) writeFileSync(join(work, name), contents)

    const result = await run(ffmpeg, plan.args, {
      signal,
      onLine: (line) => {
        const p = progressFromLine(line, plan.duration)
        if (p !== null) onProgress(p)
      }
    })
    if (signal?.aborted) throw new Error('Render cancelled.')
    if (result.code !== 0) {
      const detail = result.stderr.trim().split('\n').pop()
      throw new Error(`The clip could not be rendered${detail ? `: ${detail}` : '.'}`)
    }
    onProgress(1)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
