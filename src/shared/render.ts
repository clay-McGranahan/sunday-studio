import type { Aspect, CaptionStyle, Tracking, Word } from './types'
import { MAX_CLIP_SECONDS } from './types'
import { captionPages, CAPTION_LOOKS } from './transcript'
import { clipBounds, cropAt, cropSize, OUTPUT_SIZE } from './framing'

/** #RRGGBB → ASS &HAABBGGRR */
function assColor(hex: string, alpha = 0): string {
  const h = hex.replace('#', '')
  const hx = (n: number) => n.toString(16).padStart(2, '0').toUpperCase()
  return `&H${hx(alpha)}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase()
}

function assTime(t: number): string {
  const cs = Math.max(0, Math.round(t * 100))
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`
}

const escapeAss = (text: string) => text.replace(/\\/g, '\\\\').replace(/[{}]/g, '')

/** Word-by-word captions as an ASS subtitle file (burned in by FFmpeg/libass). */
export function buildAss(words: Word[], clipStart: number, style: CaptionStyle, aspect: Aspect): string {
  const look = CAPTION_LOOKS[style]
  const { width, height } = OUTPUT_SIZE[aspect]
  const fontSize = Math.round(look.size * height * (aspect === '16:9' ? 1.15 : 1))
  const posY = Math.round(look.position[aspect] * height)
  const dim = Math.round((1 - look.inactiveOpacity) * 255)
  const margin = Math.round(width * 0.08)

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,${look.font},${fontSize},${assColor(look.color)},${assColor(look.color)},&H00000000,${assColor('#000000', 0x60)},${look.weight >= 700 ? -1 : 0},0,0,0,100,100,${style === 'punch' ? 1 : 0},0,1,${(look.outline * height).toFixed(1)},${(look.shadow * height).toFixed(1)},5,${margin},${margin},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  const lines: string[] = []
  for (const page of captionPages(words, style)) {
    page.words.forEach((word, i) => {
      const from = i === 0 ? page.start : word.start
      const to = page.words[i + 1]?.start ?? page.end
      if (to <= from) return
      const text = page.words
        .map((w, j) => {
          const t = escapeAss(look.uppercase ? w.text.toUpperCase() : w.text)
          if (j === i && look.activeColor !== look.color) return `{\\c${assColor(look.activeColor)}}${t}{\\c${assColor(look.color)}}`
          if (j > i && dim) return `{\\alpha&H${dim.toString(16).padStart(2, '0').toUpperCase()}&}${t}{\\alpha&H00&}`
          return t
        })
        .join(' ')
      const pop = style === 'punch' && i === 0 ? '\\fscx82\\fscy82\\t(0,90,\\fscx100\\fscy100)' : ''
      const fade = style === 'minimal' && i === 0 ? '\\fad(120,0)' : ''
      lines.push(
        `Dialogue: 0,${assTime(from - clipStart)},${assTime(to - clipStart)},Caption,,0,0,0,,{\\an5\\pos(${width / 2},${posY})${pop}${fade}}${text}`
      )
    })
  }
  return header + lines.join('\n') + '\n'
}

/** Escape a path for use inside an FFmpeg filtergraph option. */
const filterPath = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")

export interface RenderInput {
  /** Local path or URL FFmpeg can seek in (HTTP range requests work). */
  source: string
  sourceWidth: number
  sourceHeight: number
  sourceDuration: number
  words: Word[]
  startWord: number
  endWord: number
  aspect: Aspect
  captionStyle: CaptionStyle
  tracking?: Tracking
  outputPath: string
  /** A directory the caller owns; the plan's files are written here. */
  workDir: string
  /** x264 preset: 'veryfast' is ~2.7x faster than 'fast' at a small size cost. */
  preset?: string
}

export interface RenderPlan {
  args: string[]
  /** Files to write into workDir before running FFmpeg (name → contents). */
  files: Record<string, string>
  duration: number
}

/** Everything needed to render a clip: FFmpeg arguments plus caption and crop-path files. Pure. */
export function planRender(input: RenderInput): RenderPlan {
  const { words, startWord, endWord, aspect } = input
  const { start, end } = clipBounds(words, startWord, endWord, input.sourceDuration)
  const duration = end - start
  if (duration > MAX_CLIP_SECONDS + 1) throw new Error('Clips can be up to 3 minutes long. Shorten the selection.')

  const join = (name: string) => `${input.workDir.replace(/[\\/]+$/, '')}/${name}`
  const files: Record<string, string> = {
    'captions.ass': buildAss(words.slice(startWord, endWord + 1), start, input.captionStyle, aspect)
  }

  const { width: outW, height: outH } = OUTPUT_SIZE[aspect]
  const size = cropSize(input.sourceWidth, input.sourceHeight, aspect)
  const t = input.tracking
  const tracking = t && t.start <= start + 0.5 && t.end >= end - 0.5 ? t : undefined
  // Tracking points are in source time; the crop helper expects time from the clip start.
  const relTracking = tracking ? { ...tracking, start: 0, points: tracking.points.map((p) => ({ ...p, t: p.t - start })) } : undefined
  const first = cropAt(input.sourceWidth, input.sourceHeight, aspect, relTracking, 0)

  const filters: string[] = []
  if (size.width !== input.sourceWidth || size.height !== input.sourceHeight) {
    if (relTracking) {
      const cmds: string[] = []
      for (let s = 0; s <= duration; s += 1 / 15) {
        const box = cropAt(input.sourceWidth, input.sourceHeight, aspect, relTracking, s)
        cmds.push(`${s.toFixed(3)} crop x ${box.x}, crop y ${box.y};`)
      }
      files['crop.cmd'] = cmds.join('\n')
      filters.push(`sendcmd=f='${filterPath(join('crop.cmd'))}'`)
    }
    filters.push(`crop=w=${size.width}:h=${size.height}:x=${first.x}:y=${first.y}`)
  }
  filters.push(`scale=${outW}:${outH}:flags=lanczos`, 'setsar=1', `ass='${filterPath(join('captions.ass'))}'`, 'format=yuv420p')

  const args = [
    '-v', 'error', '-y', '-progress', 'pipe:1', '-nostats',
    '-ss', start.toFixed(3), '-i', input.source, '-t', duration.toFixed(3),
    '-vf', filters.join(','),
    '-c:v', 'libx264', '-preset', input.preset ?? 'fast', '-crf', '19', '-profile:v', 'high',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-af', `afade=t=in:d=0.08,afade=t=out:st=${Math.max(0, duration - 0.25).toFixed(3)}:d=0.25`,
    '-movflags', '+faststart',
    input.outputPath
  ]
  return { args, files, duration }
}

/** Parse FFmpeg `-progress pipe:1` output into a 0–1 fraction of the clip. */
export function progressFromLine(line: string, duration: number): number | null {
  const m = /^out_time_us=(\d+)/.exec(line)
  return m ? Math.min(1, Number(m[1]) / 1e6 / duration) : null
}
