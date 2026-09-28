// Compares OpenRouter speech-to-text models for Sunday Studio's cloud version.
//
// Usage:
//   node scripts/stt-bench.mjs [video-or-audio] [start-seconds] [length-seconds] [reference.json]
//
// Asks for the video path and your OpenRouter key (hidden) when they aren't given. If Sunday Studio has
// already transcribed that video, its transcript is found automatically and used as the reference.
//
// For each model, transcribes the same excerpt with word-level timestamps requested and reports whether
// per-word timings came back, how the text compares to a reference transcript (Sunday Studio's
// transcript.json from local Parakeet), how far word timings drift from it, latency and cost.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import readline from 'node:readline'

const MODELS = [
  'x-ai/grok-stt-1.0',
  'openai/whisper-large-v3-turbo',
  'openai/whisper-large-v3',
  'google/gemini-3.5-transcribe',
  'nvidia/parakeet-tdt-0.6b-v3',
  'assemblyai/universal-3-5-pro',
  'fish-audio/transcribe-1'
]

/** Read a line from the terminal. */
function ask(question) {
  return new Promise((done) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      done(answer.trim().replace(/^['"]|['"]$/g, '').replace(/\\ /g, ' '))
    })
  })
}

/** Read a line from the terminal without echoing it. */
function askHidden(question) {
  return new Promise((done) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (text) => {
      if (text.startsWith(question)) process.stdout.write(text)
    }
    let answered = false
    rl.question(question, (answer) => {
      answered = true
      rl.close()
      process.stdout.write('\n')
      done(answer.trim())
    })
    // Ctrl+D / end of input: treat as no key.
    rl.on('close', () => answered || done(''))
  })
}

/** The Sunday Studio transcript for this video, if the desktop app has transcribed it. */
function findReference(media) {
  const dir = join(homedir(), 'Library', 'Application Support', 'Sunday Studio', 'projects')
  if (!existsSync(dir)) return undefined
  const matches = readdirSync(dir)
    .map((id) => join(dir, id))
    .filter((p) => existsSync(join(p, 'project.json')) && existsSync(join(p, 'transcript.json')))
    .filter((p) => resolve(JSON.parse(readFileSync(join(p, 'project.json'), 'utf8')).sourcePath) === resolve(media))
    .sort((a, b) => statSync(join(b, 'transcript.json')).mtimeMs - statSync(join(a, 'transcript.json')).mtimeMs)
  return matches[0] && join(matches[0], 'transcript.json')
}

const args = process.argv.slice(2)
const input = resolve((args[0] ?? (await ask('Sermon video (drag it here): '))).replace(/^~(?=\/)/, homedir()))
const [, startArg = '600', lengthArg = '180'] = args
const referencePath = args[3] ?? findReference(input)
if (!existsSync(input)) {
  console.error(`Video not found: ${input}\nusage: node scripts/stt-bench.mjs [media] [start] [length] [reference transcript.json]`)
  process.exit(1)
}
const key = process.env.OPENROUTER_API_KEY || (await askHidden('OpenRouter API key (input hidden): '))
if (!key) {
  console.error('No key entered.')
  process.exit(1)
}
console.log(referencePath ? `Comparing against ${referencePath}` : 'No Sunday Studio transcript found for this video; skipping accuracy comparison.')
const start = Number(startArg)
const length = Number(lengthArg)
const only = process.env.MODELS ? process.env.MODELS.split(',') : MODELS

const work = mkdtempSync(join(tmpdir(), 'stt-bench-'))
const audio = join(work, 'excerpt.mp3')
execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(start), '-t', String(length), '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio])
const bytes = readFileSync(audio)
console.log(`Excerpt ${start}s–${start + length}s, ${(bytes.length / 1e6).toFixed(2)} MB mp3\n`)

const normalize = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

let reference = null
if (referencePath && existsSync(referencePath)) {
  reference = JSON.parse(readFileSync(referencePath, 'utf8'))
    .words.filter((w) => w.start >= start && w.end <= start + length)
    .map((w) => ({ text: normalize(w.text), start: w.start - start }))
    .filter((w) => w.text)
}

/** Word error rate and median timing drift against the reference, via edit-distance alignment. */
function compare(words) {
  if (!reference) return null
  const hyp = words.map((w) => ({ text: normalize(w.word ?? w.text ?? ''), start: Number(w.start) })).filter((w) => w.text)
  const n = reference.length
  const m = hyp.length
  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (reference[i - 1].text === hyp[j - 1].text ? 0 : 1))
  const drift = []
  for (let i = n, j = m; i > 0 && j > 0; ) {
    if (reference[i - 1].text === hyp[j - 1].text && d[i][j] === d[i - 1][j - 1]) {
      if (Number.isFinite(hyp[j - 1].start)) drift.push(Math.abs(hyp[j - 1].start - reference[i - 1].start))
      i--
      j--
    } else if (d[i][j] === d[i - 1][j] + 1) i--
    else if (d[i][j] === d[i][j - 1] + 1) j--
    else {
      i--
      j--
    }
  }
  drift.sort((a, b) => a - b)
  return { wer: d[n][m] / Math.max(1, n), medianDriftMs: drift.length ? Math.round(drift[drift.length >> 1] * 1000) : null }
}

const rows = []
for (const model of only) {
  const form = new FormData()
  form.append('model', model)
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), 'excerpt.mp3')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  form.append('language', 'en')
  const t0 = Date.now()
  let row = { model }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'X-Title': 'Sunday Studio STT bench' },
      body: form
    })
    const seconds = (Date.now() - t0) / 1000
    const body = await res.json().catch(async () => ({ error: { message: await res.text() } }))
    if (!res.ok) {
      row = { ...row, status: res.status, error: body?.error?.message?.slice(0, 120) ?? 'error', seconds }
    } else {
      const words = Array.isArray(body.words) ? body.words : []
      row = {
        ...row,
        status: 200,
        seconds,
        wordTimestamps: words.length > 0,
        words: words.length,
        segments: Array.isArray(body.segments) ? body.segments.length : 0,
        cost: body.usage?.cost,
        sample: words.slice(0, 4).map((w) => `${w.word ?? w.text}@${Number(w.start).toFixed(2)}`).join(' '),
        ...(words.length ? compare(words) : {})
      }
    }
  } catch (err) {
    row = { ...row, error: String(err).slice(0, 120) }
  }
  rows.push(row)
  console.log(JSON.stringify(row))
}

console.log('\nSummary (word timestamps required):')
console.table(
  rows.map((r) => ({
    model: r.model,
    ok: r.status === 200 ? 'yes' : `no (${r.status ?? 'err'})`,
    words: r.wordTimestamps ? r.words : 'none',
    'WER vs ref': r.wer !== undefined ? `${(r.wer * 100).toFixed(1)}%` : '',
    'timing drift': r.medianDriftMs !== undefined && r.medianDriftMs !== null ? `${r.medianDriftMs} ms` : '',
    seconds: r.seconds?.toFixed(1),
    cost: r.cost !== undefined ? `$${Number(r.cost).toFixed(4)}` : ''
  }))
)
rmSync(work, { recursive: true, force: true })
