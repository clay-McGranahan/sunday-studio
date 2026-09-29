import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import opentype from 'opentype.js'
import type { TextMeasurer } from './transcript'

/** The bundled caption fonts (resources/fonts), by the family name captions use. */
const FONT_FILES: Record<string, string> = {
  Figtree: 'Figtree-Bold.ttf',
  'Archivo Black': 'ArchivoBlack-Regular.ttf',
  Literata: 'Literata-Regular.ttf'
}

type Font = ReturnType<typeof opentype.parse>

/**
 * Measures caption text with the real font files, so the export knows how wide a word will be
 * before FFmpeg draws it. Runs in Node (the desktop app's main process and the cloud server).
 */
export function createFontMeasurer(fontsDir: string): TextMeasurer {
  const cache = new Map<string, Font | null>()
  const load = (family: string): Font | null => {
    if (!cache.has(family)) {
      let font: Font | null = null
      try {
        const buf = readFileSync(join(fontsDir, FONT_FILES[family] ?? ''))
        font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
      } catch {
        font = null
      }
      cache.set(family, font)
    }
    return cache.get(family) ?? null
  }
  return (text, look, sizePx) => {
    const font = load(look.font)
    // Without the font file, assume a typical width so a long word still gets scaled down.
    return font ? font.getAdvanceWidth(text, sizePx, { kerning: true }) : text.length * sizePx * 0.62
  }
}
