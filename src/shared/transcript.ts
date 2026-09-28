import type { CaptionStyle, Word } from './types'

export interface Span {
  startWord: number
  endWord: number
}

const SENTENCE_END = /[.?!]["'”’)]*$/

export function endsSentence(word: Word): boolean {
  return SENTENCE_END.test(word.text)
}

/** Group words into readable paragraphs: break at a sentence end after ~25s, or at any long pause. */
export function paragraphs(words: Word[]): Span[] {
  const out: Span[] = []
  let start = 0
  for (let i = 0; i < words.length; i++) {
    const next = words[i + 1]
    if (!next) break
    const gap = next.start - words[i].end
    const elapsed = words[i].end - words[start].start
    if (gap > 2 || (endsSentence(words[i]) && (elapsed > 25 || gap > 1.2))) {
      out.push({ startWord: start, endWord: i })
      start = i + 1
    }
  }
  if (words.length) out.push({ startWord: start, endWord: words.length - 1 })
  return out
}

/** Split into sentences, capping run-ons so each unit stays a reasonable size. */
export function sentences(words: Word[], maxWords = 45): Span[] {
  const out: Span[] = []
  let start = 0
  for (let i = 0; i < words.length; i++) {
    const long = i - start + 1 >= maxWords
    const pause = words[i + 1] ? words[i + 1].start - words[i].end > 1.5 : false
    if (endsSentence(words[i]) || long || pause || i === words.length - 1) {
      out.push({ startWord: start, endWord: i })
      start = i + 1
    }
  }
  return out
}

export function spanText(words: Word[], span: Span): string {
  return words
    .slice(span.startWord, span.endWord + 1)
    .map((w) => w.text)
    .join(' ')
}

export function formatTime(seconds: number, withTenths = false): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const secStr = withTenths ? sec.toFixed(1).padStart(4, '0') : Math.floor(sec).toString().padStart(2, '0')
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${secStr}` : `${m}:${secStr}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`
  return `${Math.round(bytes / 1e3)} KB`
}

/* ---------- Captions ---------- */

export interface CaptionPage {
  words: Word[]
  start: number
  end: number
}

export interface CaptionLook {
  label: string
  blurb: string
  maxWords: number
  uppercase: boolean
  font: string
  weight: number
  /** Font size as a fraction of output height. */
  size: number
  color: string
  activeColor: string
  inactiveOpacity: number
  outline: number
  shadow: number
  /** Vertical centre of the caption block as a fraction of output height, per aspect. */
  position: { '9:16': number; '1:1': number; '16:9': number }
}

export const CAPTION_LOOKS: Record<CaptionStyle, CaptionLook> = {
  clean: {
    label: 'Clean',
    blurb: 'Clear and confident',
    maxWords: 6,
    uppercase: false,
    font: 'Avenir Next',
    weight: 700,
    size: 0.058,
    color: '#FFFFFF',
    activeColor: '#FFD84D',
    inactiveOpacity: 1,
    outline: 0.0035,
    shadow: 0.002,
    position: { '9:16': 0.7, '1:1': 0.8, '16:9': 0.84 }
  },
  punch: {
    label: 'Punch',
    blurb: 'Bold and energetic',
    maxWords: 3,
    uppercase: true,
    font: 'Arial Black',
    weight: 900,
    size: 0.068,
    color: '#FFFFFF',
    activeColor: '#FFE14A',
    inactiveOpacity: 1,
    outline: 0.006,
    shadow: 0.003,
    position: { '9:16': 0.62, '1:1': 0.72, '16:9': 0.8 }
  },
  minimal: {
    label: 'Minimal',
    blurb: 'Quiet and editorial',
    maxWords: 9,
    uppercase: false,
    font: 'Georgia',
    weight: 400,
    size: 0.036,
    color: '#FFFFFF',
    activeColor: '#FFFFFF',
    inactiveOpacity: 0.6,
    outline: 0.0012,
    shadow: 0.002,
    position: { '9:16': 0.74, '1:1': 0.86, '16:9': 0.88 }
  }
}

/** Break a clip's words into on-screen caption pages, timed to the speech. */
export function captionPages(words: Word[], style: CaptionStyle): CaptionPage[] {
  const { maxWords } = CAPTION_LOOKS[style]
  const pages: CaptionPage[] = []
  let current: Word[] = []
  const flush = () => {
    if (current.length) pages.push({ words: current, start: current[0].start, end: current[current.length - 1].end })
    current = []
  }
  words.forEach((word, i) => {
    current.push(word)
    const next = words[i + 1]
    const gap = next ? next.start - word.end : 0
    const clause = /[,;:—–-]$/.test(word.text)
    if (current.length >= maxWords || endsSentence(word) || gap > 0.6 || (clause && current.length >= maxWords / 2)) flush()
  })
  flush()
  // Hold each page on screen until the next starts, if the pause is short.
  for (let i = 0; i < pages.length - 1; i++) {
    if (pages[i + 1].start - pages[i].end < 0.5) pages[i].end = pages[i + 1].start
  }
  return pages
}
