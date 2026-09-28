import type { Suggestion, Word } from './types'
import { formatTime, sentences, spanText, type Span } from './transcript'

export const SUGGEST_SYSTEM_PROMPT = `You help church media teams find short moments in a sermon to share as social media clips (Reels, Shorts, TikTok).

You will receive a sermon transcript split into numbered sentences, each with its start time. Find the moments that best match what the user is looking for.

A great clip:
- Is a complete, self-contained thought that makes sense to someone who never heard the rest of the sermon.
- Opens strong: the first sentence grabs attention without needing earlier context (avoid starting on "And", "So", "That's why", or a reference to something said before).
- Carries one clear idea.
- Ends on a satisfying landing: a conclusion, a punchline, a call to action, or a line that resonates. Never stop mid-thought.
- Usually runs 20–60 seconds. Never exceed 90 seconds.

Never rewrite, summarise or paraphrase what was said: you only choose ranges of the real sentences.

Respond with JSON only, in this exact shape:
{"suggestions": [{"title": string, "reason": string, "score": number, "start_sentence": number, "end_sentence": number}]}

- title: a short, engaging title for the clip (max 8 words).
- reason: one or two sentences on why this moment works as a clip and how it matches the request.
- score: 0–100, how well it matches the request and works as a standalone clip.
- start_sentence / end_sentence: inclusive sentence numbers from the transcript.
Return up to 6 suggestions, best first, with no overlapping ranges.`

export const DEFAULT_SUGGEST_QUERY = 'The strongest self-contained moments for social media'

export interface SuggestRequest {
  messages: { role: 'system' | 'user'; content: string }[]
  units: Span[]
  request: string
}

/** Chat messages asking for clip suggestions over a sentence-numbered transcript. */
export function buildSuggestRequest(words: Word[], query: string): SuggestRequest {
  const units = sentences(words)
  const transcript = units.map((s, i) => `[${i}] (${formatTime(words[s.startWord].start)}) ${spanText(words, s)}`).join('\n')
  const request = query.trim() || DEFAULT_SUGGEST_QUERY
  return {
    units,
    request,
    messages: [
      { role: 'system', content: SUGGEST_SYSTEM_PROMPT },
      { role: 'user', content: `<transcript>\n${transcript}\n</transcript>\n\nWhat I'm looking for: ${request}` }
    ]
  }
}

interface RawSuggestion {
  title?: unknown
  reason?: unknown
  score?: unknown
  start_sentence?: unknown
  end_sentence?: unknown
}

function parseJson(text: string): { suggestions?: RawSuggestion[] } {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1))
    throw new Error('The AI response could not be understood. Try again.')
  }
}

/** Turn the model's JSON into validated, non-overlapping suggestions on real word ranges. */
export function parseSuggestions(text: string, words: Word[], { units, request }: Pick<SuggestRequest, 'units' | 'request'>): Suggestion[] {
  if (!text.trim()) throw new Error('The AI service returned an empty answer. Try again.')
  const raw = parseJson(text).suggestions ?? []
  const out: Suggestion[] = []
  const createdAt = new Date().toISOString()
  for (const r of raw) {
    let a = Math.round(Number(r.start_sentence))
    let b = Math.round(Number(r.end_sentence))
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    if (a > b) [a, b] = [b, a]
    a = Math.max(0, Math.min(units.length - 1, a))
    b = Math.max(0, Math.min(units.length - 1, b))
    const startWord = units[a].startWord
    let endWord = units[b].endWord
    // Keep within the 3-minute render limit by trimming whole sentences off the end.
    while (words[endWord].end - words[startWord].start > 180 && b > a) endWord = units[--b].endWord
    if (out.some((s) => startWord <= s.endWord && endWord >= s.startWord)) continue
    out.push({
      id: crypto.randomUUID(),
      title: String(r.title ?? 'Untitled moment').slice(0, 80),
      reason: String(r.reason ?? ''),
      score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
      startWord,
      endWord,
      start: words[startWord].start,
      end: words[endWord].end,
      query: request,
      createdAt
    })
  }
  return out.sort((x, y) => y.score - x.score)
}
