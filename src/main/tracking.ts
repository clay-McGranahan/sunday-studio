import type { Tracking } from '@shared/types'
import { buildTracking, type DetectedFrame } from '@shared/tracking'
import { run, trackerPath } from './tools'

export async function trackSpeaker(
  sourcePath: string,
  start: number,
  end: number,
  onProgress: (p: number) => void
): Promise<Tracking> {
  const tracker = trackerPath()
  if (!tracker) throw new Error('Speaker tracking is not set up. Open Settings to build it.')
  const frames: DetectedFrame[] = []
  let failure = ''
  const { code } = await run(tracker, [sourcePath, String(start), String(end), '6'], {
    onLine: (line) => {
      try {
        const e = JSON.parse(line)
        if (e.type === 'frame') frames.push({ t: e.t, people: e.people })
        else if (e.type === 'progress') onProgress(e.value)
        else if (e.type === 'error') failure = e.message
      } catch {
        /* ignore */
      }
    }
  })
  if (code !== 0) throw new Error(`Speaker tracking failed${failure ? `: ${failure}` : '.'}`)
  return buildTracking(frames, start, end)
}
