import type { Aspect, Tracking, Word } from './types'

const LEAD_IN = 0.12
const TAIL = 0.35

/** Clip boundaries in source time, with a little breathing room around the selected words. */
export function clipBounds(words: Word[], startWord: number, endWord: number, duration: number) {
  const start = Math.max(0, words[startWord].start - LEAD_IN)
  const nextStart = words[endWord + 1]?.start ?? duration
  const end = Math.min(duration, words[endWord].end + TAIL, Math.max(words[endWord].end, nextStart - 0.05))
  return { start, end }
}

export const OUTPUT_SIZE: Record<Aspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '16:9': { width: 1920, height: 1080 }
}

export const ASPECT_INFO: Record<Aspect, { label: string; use: string }> = {
  '9:16': { label: 'Vertical', use: 'Reels, Shorts, TikTok' },
  '1:1': { label: 'Square', use: 'Feed posts' },
  '16:9': { label: 'Widescreen', use: 'YouTube' }
}

/** Areas covered by platform UI (fractions of the output frame). */
export const SAFE_ZONES: Record<Aspect, { top: number; bottom: number; right: number; left: number }> = {
  '9:16': { top: 0.13, bottom: 0.2, right: 0.14, left: 0.05 },
  '1:1': { top: 0.06, bottom: 0.1, right: 0.06, left: 0.06 },
  '16:9': { top: 0.06, bottom: 0.12, right: 0.05, left: 0.05 }
}

export interface CropBox {
  /** All in source pixels. */
  x: number
  y: number
  width: number
  height: number
}

/** Size of the crop window over a source frame for a target aspect. */
export function cropSize(srcW: number, srcH: number, aspect: Aspect): { width: number; height: number } {
  const { width, height } = OUTPUT_SIZE[aspect]
  const target = width / height
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)
  if (srcW / srcH > target) return { width: even(srcH * target), height: even(srcH) }
  return { width: even(srcW), height: even(srcW / target) }
}

/** Subject centre (normalised) at time t (seconds from clip start), interpolated. */
export function centerAt(tracking: Tracking | undefined, t: number): { x: number; y: number } {
  const pts = tracking?.points
  if (!pts?.length) return { x: 0.5, y: 0.4 }
  const abs = tracking!.start + t
  if (abs <= pts[0].t) return pts[0]
  if (abs >= pts[pts.length - 1].t) return pts[pts.length - 1]
  let lo = 0
  let hi = pts.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (pts[mid].t <= abs) lo = mid
    else hi = mid
  }
  const a = pts[lo]
  const b = pts[hi]
  const k = (abs - a.t) / (b.t - a.t || 1)
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }
}

export function cropAt(srcW: number, srcH: number, aspect: Aspect, tracking: Tracking | undefined, t: number): CropBox {
  const size = cropSize(srcW, srcH, aspect)
  const c = centerAt(tracking, t)
  const clamp = (v: number, max: number) => Math.round(Math.max(0, Math.min(max, v)))
  return {
    ...size,
    x: clamp(c.x * srcW - size.width / 2, srcW - size.width),
    // Keep a little headroom: place the subject slightly above centre when cropping vertically.
    y: clamp(c.y * srcH - size.height * 0.4, srcH - size.height)
  }
}
