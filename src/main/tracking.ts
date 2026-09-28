import type { TrackPoint, Tracking } from '@shared/types'
import { run, trackerPath } from './tools'

interface Box {
  x: number
  y: number
  w: number
  h: number
  confidence: number
  face: boolean
}

interface Frame {
  t: number
  people: Box[]
}

const cx = (b: Box) => b.x + b.w / 2
const cy = (b: Box) => b.y + b.h / 2
const area = (b: Box) => b.w * b.h
const contains = (outer: Box, inner: Box) =>
  cx(inner) >= outer.x && cx(inner) <= outer.x + outer.w && cy(inner) >= outer.y && cy(inner) <= outer.y + outer.h

/** Pick the speaker in each frame and return their (face-preferred) centre, or null when unseen. */
function followSubject(frames: Frame[]): ({ t: number; x: number; y: number } | null)[] {
  // Start with the most prominent person: a large, confident body, ideally with a visible face.
  const score = (b: Box, faces: Box[]) => area(b) * b.confidence * (faces.some((f) => contains(b, f)) ? 1.5 : 1)
  let last: { x: number; y: number } | null = null
  for (const f of frames.slice(0, 15)) {
    const bodies = f.people.filter((p) => !p.face)
    const faces = f.people.filter((p) => p.face)
    const best = bodies.sort((a, b) => score(b, faces) - score(a, faces))[0]
    if (best) {
      last = { x: cx(best), y: cy(best) }
      break
    }
  }

  return frames.map((f) => {
    const bodies = f.people.filter((p) => !p.face)
    const faces = f.people.filter((p) => p.face)
    const candidates = bodies.length ? bodies : faces
    if (!candidates.length) return null
    // Stay with whoever is closest to where the speaker was; penalise far jumps and tiny boxes.
    const pick = candidates
      .map((b) => {
        const dist = last ? Math.hypot(cx(b) - last.x, (cy(b) - last.y) * 0.5) : 0
        return { b, cost: dist - Math.sqrt(area(b)) * 0.3 }
      })
      .sort((a, b) => a.cost - b.cost)[0].b
    if (last && Math.abs(cx(pick) - last.x) > 0.35) return null // likely someone else; hold position
    const face = faces.find((fc) => contains(pick, fc))
    const point = face ? { x: cx(face), y: cy(face) } : { x: cx(pick), y: pick.y + pick.h * 0.25 }
    last = { x: cx(pick), y: cy(pick) }
    return { t: f.t, ...point }
  })
}

/** Turn noisy positions into calm camera motion: a dead zone, eased follow, then a short average. */
function smoothCamera(times: number[], raw: ({ x: number; y: number } | null)[]): TrackPoint[] {
  const DEAD_ZONE = 0.05
  const TIME_CONSTANT = 0.7 // seconds
  const firstSeen = raw.find((r) => r) ?? { x: 0.5, y: 0.4 }
  let cam = { ...firstSeen }
  let target = { ...firstSeen }
  const eased: TrackPoint[] = []
  times.forEach((t, i) => {
    const seen = raw[i]
    if (seen) {
      if (Math.abs(seen.x - target.x) > DEAD_ZONE) target.x = seen.x - Math.sign(seen.x - target.x) * DEAD_ZONE * 0.5
      if (Math.abs(seen.y - target.y) > DEAD_ZONE) target.y = seen.y - Math.sign(seen.y - target.y) * DEAD_ZONE * 0.5
    }
    const dt = i ? t - times[i - 1] : 0
    const k = 1 - Math.exp(-dt / TIME_CONSTANT)
    cam = { x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k }
    eased.push({ t, ...cam })
  })
  const half = 3
  return eased.map((p, i) => {
    const win = eased.slice(Math.max(0, i - half), i + half + 1)
    return {
      t: Number(p.t.toFixed(3)),
      x: Number((win.reduce((s, q) => s + q.x, 0) / win.length).toFixed(4)),
      y: Number((win.reduce((s, q) => s + q.y, 0) / win.length).toFixed(4))
    }
  })
}

export async function trackSpeaker(
  sourcePath: string,
  start: number,
  end: number,
  onProgress: (p: number) => void
): Promise<Tracking> {
  const tracker = trackerPath()
  if (!tracker) throw new Error('Speaker tracking is not set up. Open Settings to build it.')
  const frames: Frame[] = []
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
  if (!frames.length) throw new Error('No frames could be read for tracking.')

  const raw = followSubject(frames)
  const seen = raw.filter(Boolean).length
  return {
    start,
    end,
    points: smoothCamera(
      frames.map((f) => f.t),
      raw
    ),
    coverage: seen / frames.length
  }
}
