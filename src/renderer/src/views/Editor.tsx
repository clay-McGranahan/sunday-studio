import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Aspect, CaptionStyle, Project, Selection, Suggestion, Transcript, Word } from '@shared/types'
import { MAX_CLIP_SECONDS } from '@shared/types'
import { ASPECT_INFO, clipBounds, cropSize } from '@shared/framing'
import { CAPTION_LOOKS, formatBytes, formatDuration, formatTime } from '@shared/transcript'
import { Icon, ProgressBar, Spinner } from '../components/Common'
import FramedPlayer from '../components/FramedPlayer'
import PreviewPlayer from '../components/PreviewPlayer'
import { ClipLibrary, SuggestionsPanel } from '../components/Suggestions'
import TranscriptView from '../components/TranscriptView'
import { api, videoUrl } from '../lib/api'
import { useToast } from '../lib/toast'

type Step = 1 | 2 | 3 | 4

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Bring in' },
  { n: 2, label: 'Choose a moment' },
  { n: 3, label: 'Frame' },
  { n: 4, label: 'Captions & export' }
]

interface Props {
  projectId: string
  onExit: () => void
  onSettings: () => void
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** Index of the word being spoken at time t (binary search). */
function wordAtTime(words: Word[], t: number): number {
  let lo = 0
  let hi = words.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (words[mid].end < t) lo = mid + 1
    else if (words[mid].start > t) hi = mid - 1
    else return mid
  }
  return -1
}

export default function Editor({ projectId, onExit, onSettings }: Props) {
  const toast = useToast()
  const [project, setProject] = useState<Project | null>(null)
  const [saved, setSaved] = useState<Transcript | null>(null)
  const [words, setWords] = useState<Word[]>([])
  const [step, setStep] = useState<Step>(1)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [aiConfigured, setAiConfigured] = useState(false)
  const [live, setLive] = useState<{ progress?: number; message?: string }>({})
  const [activeWord, setActiveWord] = useState(-1)
  const [seek, setSeek] = useState<{ time: number; nonce: number } | null>(null)
  const [scrollTo, setScrollTo] = useState<{ word: number; nonce: number } | null>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)

  const load = useCallback(async () => {
    const detail = await api.getProject(projectId)
    setProject(detail.project)
    setSaved(detail.transcript)
    setWords(detail.transcript?.words ?? [])
    setSelection((s) => s ?? detail.project.selection ?? null)
    if (detail.project.status === 'ready' && detail.transcript) setStep((s) => (s === 1 ? 2 : s))
    return detail
  }, [projectId])

  const exitRef = useRef(onExit)
  exitRef.current = onExit
  useEffect(() => {
    load().catch((err) => {
      toast.error(err)
      exitRef.current()
    })
    api.getAi().then((s) => setAiConfigured(s.configured), () => {})
  }, [load, toast])

  useEffect(
    () =>
      api.onProgress((e) => {
        if (e.kind !== 'project' || e.projectId !== projectId) return
        setLive({ progress: e.progress, message: e.message })
        setProject((p) => (p ? { ...p, status: e.status, statusMessage: e.message } : p))
        if (e.status === 'ready') {
          void load().then((d) => toast.show(`${(d.transcript?.words.length ?? 0).toLocaleString()} words transcribed`, 'success'))
        }
      }),
    [projectId, load, toast]
  )

  // Persist the selection so reopening the project brings it back.
  useEffect(() => {
    if (!project || project.status !== 'ready') return
    const t = setTimeout(() => void api.updateProject(projectId, { selection: selection ?? undefined }).catch(() => {}), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, projectId])

  const corrections = useMemo(() => (saved ? words.filter((w, i) => w.text !== saved.words[i]?.text).length : 0), [words, saved])

  const saveCorrections = useCallback(async () => {
    if (!corrections) return
    try {
      const t = await api.saveTranscript(projectId, words)
      setSaved(t)
      setWords(t.words)
      toast.show(`${corrections} ${corrections === 1 ? 'correction' : 'corrections'} saved`, 'success')
    } catch (err) {
      toast.error(err)
      throw err
    }
  }, [corrections, projectId, words, toast])

  const exit = () => {
    if (corrections && !window.confirm('You have unsaved transcript corrections. Leave without saving them?')) return
    onExit()
  }

  const onEditWord = useCallback((i: number, text: string) => {
    setWords((ws) => ws.map((w, j) => (j === i ? { ...w, text } : w)))
  }, [])

  const onTime = useCallback((t: number) => setActiveWord((prev) => {
    const i = wordAtTime(words, t)
    return i === prev ? prev : i
  }), [words])

  const onSeek = useCallback((time: number) => setSeek({ time, nonce: Date.now() }), [])

  const bounds = useMemo(
    () => (selection && words.length && project ? clipBounds(words, selection.startWord, selection.endWord, project.duration) : null),
    [selection, words, project]
  )
  const clipLength = bounds ? bounds.end - bounds.start : 0
  const tooLong = clipLength > MAX_CLIP_SECONDS
  const selectedSuggestion = project?.suggestions.find((s) => selection && s.startWord === selection.startWord && s.endWord === selection.endWord) ?? null

  const pickSuggestion = (s: Suggestion) => {
    setSelection({ startWord: s.startWord, endWord: s.endWord })
    setScrollTo({ word: s.startWord, nonce: Date.now() })
    setStep(2)
    setLibraryOpen(false)
  }

  const runSuggestions = async (query: string) => {
    try {
      const p = await api.suggest(projectId, query)
      setProject(p)
      const fresh = p.suggestions.filter((s) => s.createdAt === p.suggestions[0]?.createdAt)
      toast.show(`${fresh.length} ${fresh.length === 1 ? 'moment' : 'moments'} found`, 'success')
      if (fresh[0] && !selection) pickSuggestion(fresh[0])
    } catch (err) {
      toast.error(err)
    }
  }

  const patchProject = async (patch: Partial<Pick<Project, 'aspect' | 'captionStyle' | 'name'>>) => {
    setProject((p) => (p ? { ...p, ...patch } : p))
    await api.updateProject(projectId, patch).catch(toast.error)
  }

  if (!project) {
    return (
      <div className="page center">
        <Spinner />
      </div>
    )
  }

  const ready = project.status === 'ready' && words.length > 0
  const canFrame = ready && selection !== null && !tooLong
  const clipWords = selection ? words.slice(selection.startWord, selection.endWord + 1) : []
  const clipTitle = selectedSuggestion?.title ?? clipWords.slice(0, 6).map((w) => w.text).join(' ')

  return (
    <div className="page editor">
      <header className="topbar">
        <div className="row">
          <button className="btn btn-ghost btn-icon-text" onClick={exit}>
            <Icon name="back" /> Projects
          </button>
          {editingName ? (
            <input
              className="rename title-input"
              autoFocus
              defaultValue={project.name}
              onBlur={(e) => {
                setEditingName(false)
                if (e.target.value.trim() && e.target.value.trim() !== project.name) void patchProject({ name: e.target.value.trim() })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingName(false)
              }}
            />
          ) : (
            <button className="project-title" onClick={() => setEditingName(true)} title="Rename">
              {project.name}
            </button>
          )}
        </div>
        <nav className="stepper">
          {STEPS.map(({ n, label }) => {
            const enabled = n === 1 || (n === 2 && ready) || (n >= 3 && canFrame)
            const done = n < step || (n === 1 && ready)
            return (
              <button key={n} className={`step ${step === n ? 'current' : ''} ${done ? 'done' : ''}`} disabled={!enabled} onClick={() => setStep(n)}>
                <span className="step-n">{done && step !== n ? <Icon name="check" size={13} /> : n}</span>
                {label}
              </button>
            )
          })}
        </nav>
        <div className="row end">
          <button className="btn btn-ghost btn-icon-text" disabled={!ready} onClick={() => setLibraryOpen(true)}>
            <Icon name="library" /> Clip library
            {project.suggestions.length > 0 && <span className="count">{project.suggestions.length}</span>}
          </button>
          <button className="icon-btn" onClick={onSettings} title="Settings">
            <Icon name="settings" />
          </button>
        </div>
      </header>

      {step === 1 && <ImportStep project={project} live={live} ready={ready} onNext={() => setStep(2)} />}

      {step === 2 && ready && (
        <div className="workspace">
          <section className="main-col">
            <div className="transcript-head">
              <div>
                <h2>Read and choose a moment</h2>
                <p className="muted small">
                  Drag across words to select a clip. Drag the handles to fine-tune. Double-click a word to fix it.
                </p>
              </div>
              {corrections > 0 && (
                <div className="save-bar">
                  <span className="small">
                    {corrections} unsaved {corrections === 1 ? 'correction' : 'corrections'}
                  </span>
                  <button className="btn btn-small" onClick={() => setWords(saved!.words)}>
                    Discard
                  </button>
                  <button className="btn btn-small btn-primary" onClick={() => void saveCorrections()}>
                    Save corrections
                  </button>
                </div>
              )}
            </div>
            <TranscriptView
              words={words}
              selection={selection}
              activeWord={activeWord}
              scrollTo={scrollTo}
              onSelect={setSelection}
              onSeek={onSeek}
              onEditWord={onEditWord}
            />
          </section>
          <aside className="side-col side-col-pinned">
            <PreviewPlayer src={videoUrl(project.id)} bounds={bounds} seek={seek} onTime={onTime} />
            <div className="panel selection-panel">
              {selection && bounds ? (
                <>
                  <p className="clip-facts tabular">
                    <strong className={tooLong ? 'warn-text' : undefined}>{formatDuration(clipLength)}</strong> clip, {formatTime(bounds.start, true)}{' '}
                    to {formatTime(bounds.end, true)}, {selection.endWord - selection.startWord + 1} words
                  </p>
                  {tooLong && <p className="warn-text small">Clips can be up to 3 minutes. Shorten the selection to continue.</p>}
                  <div className="row">
                    <button className="btn btn-ghost btn-small" onClick={() => setSelection(null)}>
                      Clear
                    </button>
                    <span className="grow" />
                    <button className="btn btn-primary" disabled={!canFrame} onClick={() => setStep(3)}>
                      Frame this clip
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted small">No selection yet. Drag across the transcript, or pick a suggested moment below.</p>
              )}
            </div>
            <SuggestionsPanel
              suggestions={project.suggestions}
              lastQuery={project.suggestionQuery}
              aiConfigured={aiConfigured}
              selectedId={selectedSuggestion?.id ?? null}
              onRun={runSuggestions}
              onPick={pickSuggestion}
              onSettings={onSettings}
            />
          </aside>
        </div>
      )}

      {step === 3 && canFrame && bounds && (
        <FrameStep project={project} bounds={bounds} selection={selection!} onProject={setProject} onAspect={(aspect) => void patchProject({ aspect })} onBack={() => setStep(2)} onNext={() => setStep(4)} />
      )}

      {step === 4 && canFrame && bounds && (
        <ExportStep
          project={project}
          bounds={bounds}
          selection={selection!}
          clipWords={clipWords}
          title={clipTitle}
          onStyle={(captionStyle) => void patchProject({ captionStyle })}
          beforeRender={async () => {
            if (corrections) await saveCorrections()
          }}
          onBack={() => setStep(3)}
        />
      )}

      {libraryOpen && (
        <ClipLibrary
          suggestions={project.suggestions}
          words={words}
          onEdit={pickSuggestion}
          onRemove={async (s) => setProject(await api.removeSuggestion(projectId, s.id))}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  )
}

/* ---------- Step 1 ---------- */

function ImportStep({ project, live, ready, onNext }: { project: Project; live: { progress?: number; message?: string }; ready: boolean; onNext: () => void }) {
  const toast = useToast()
  const failed = project.status === 'error'
  const stages = [
    { key: 'preparing', label: 'Prepare the video' },
    { key: 'transcribing', label: 'Transcribe with Parakeet' },
    { key: 'ready', label: 'Ready to edit' }
  ]
  const order = ['queued', 'preparing', 'transcribing', 'ready']
  const current = order.indexOf(project.status)
  return (
    <div className="center-stage">
      <div className="import-card">
        <h2>{project.name}</h2>
        <p className="meta-row muted small">
          <span>{project.sourceName}</span>
          <span>{formatBytes(project.sourceSize)}</span>
          <span>{formatDuration(project.duration)}</span>
          <span>
            {project.width}×{project.height}
          </span>
        </p>
        <ol className="stages">
          {stages.map((s) => {
            const idx = order.indexOf(s.key)
            const state = failed ? (idx < current ? 'done' : '') : idx < current || ready ? 'done' : idx === current ? 'active' : ''
            return (
              <li key={s.key} className={state}>
                <span className="stage-mark">{state === 'done' ? <Icon name="check" size={13} /> : state === 'active' ? <Spinner /> : null}</span>
                <span>{s.label}</span>
                {state === 'active' && s.key !== 'ready' && (
                  <div className="stage-progress">
                    <ProgressBar value={live.progress} indeterminate={!live.progress} />
                    <span className="small muted">{live.message ?? project.statusMessage}</span>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
        {failed && (
          <div className="error-box">
            <p>{project.statusMessage ?? 'Something went wrong.'}</p>
            <button className="btn btn-primary" onClick={() => api.retryProject(project.id).catch(toast.error)}>
              Try again
            </button>
          </div>
        )}
        {ready ? (
          <button className="btn btn-primary" onClick={onNext}>
            Read the transcript
          </button>
        ) : (
          !failed && (
            <div className="row">
              <p className="muted small grow">Everything runs on this Mac. Transcription keeps going in the background if you go back to your projects.</p>
              <button className="btn btn-ghost btn-small" onClick={() => api.cancelProject(project.id).catch(toast.error)}>
                Cancel
              </button>
            </div>
          )
        )}
      </div>
    </div>
  )
}

/* ---------- Step 3 ---------- */

function FrameStep({
  project,
  bounds,
  selection,
  onProject,
  onAspect,
  onBack,
  onNext
}: {
  project: Project
  bounds: { start: number; end: number }
  selection: Selection
  onProject: (p: Project) => void
  onAspect: (a: Aspect) => void
  onBack: () => void
  onNext: () => void
}) {
  const toast = useToast()
  const [stageRef, stage] = useSize<HTMLDivElement>()
  const [tracking, setTracking] = useState(false)
  const [trackProgress, setTrackProgress] = useState(0)
  const [safeZones, setSafeZones] = useState(true)
  const attempted = useRef('')

  const trackValid = project.tracking && project.tracking.start <= bounds.start + 0.5 && project.tracking.end >= bounds.end - 0.5
  const crop = cropSize(project.width, project.height, project.aspect)
  const needsTracking = crop.width < project.width

  useEffect(() => api.onProgress((e) => e.kind === 'tracking' && setTrackProgress(e.progress)), [])

  const track = useCallback(async () => {
    setTracking(true)
    setTrackProgress(0)
    try {
      const p = await api.track(project.id, selection.startWord, selection.endWord)
      onProject(p)
      const coverage = p.tracking?.coverage ?? 0
      if (coverage < 0.4) toast.show('The speaker was hard to find in this clip, so framing stays mostly centred.', 'info')
      else toast.show('Speaker tracked', 'success')
    } catch (err) {
      toast.error(err)
    } finally {
      setTracking(false)
    }
  }, [project.id, selection.startWord, selection.endWord, onProject, toast])

  // Track automatically the first time a narrower shape needs it.
  useEffect(() => {
    const key = `${selection.startWord}-${selection.endWord}`
    if (needsTracking && !trackValid && !tracking && attempted.current !== key) {
      attempted.current = key
      void track()
    }
  }, [needsTracking, trackValid, tracking, track, selection.startWord, selection.endWord])

  return (
    <div className="workspace">
      <section className="stage" ref={stageRef}>
        {stage.height > 0 && (
          <FramedPlayer
            src={videoUrl(project.id)}
            srcWidth={project.width}
            srcHeight={project.height}
            clip={bounds}
            aspect={project.aspect}
            tracking={trackValid ? project.tracking : undefined}
            showSafeZones={safeZones}
            maxHeight={stage.height - 70}
            maxWidth={stage.width - 48}
          />
        )}
      </section>
      <aside className="side-col">
        <div className="panel">
          <h3>Shape</h3>
          <div className="aspect-options">
            {(Object.keys(ASPECT_INFO) as Aspect[]).map((a) => (
              <button key={a} className={`aspect-option ${project.aspect === a ? 'active' : ''}`} onClick={() => onAspect(a)}>
                <span className={`aspect-glyph aspect-${a.replace(':', 'x')}`} />
                <span className="aspect-text">
                  <strong>
                    {a} {ASPECT_INFO[a].label}
                  </strong>
                  <span className="muted small">{ASPECT_INFO[a].use}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <Icon name="target" />
            <h3>Speaker tracking</h3>
          </div>
          {!needsTracking ? (
            <p className="muted small">This shape shows the full frame, so no tracking is needed.</p>
          ) : tracking ? (
            <>
              <ProgressBar value={trackProgress} />
              <p className="muted small">Finding the speaker in each moment of the clip…</p>
            </>
          ) : trackValid ? (
            <>
              <p className="small">
                <span className="ok-text">✓ Following the speaker</span>
                <span className="muted"> Seen in {Math.round((project.tracking!.coverage ?? 0) * 100)}% of the clip.</span>
              </p>
              <button className="btn btn-small" onClick={() => void track()}>
                Track again
              </button>
            </>
          ) : (
            <>
              <p className="muted small">Keeps the pastor in frame even when they move around the stage.</p>
              <button className="btn btn-small btn-primary" onClick={() => void track()}>
                Track speaker
              </button>
            </>
          )}
        </div>
        <div className="panel">
          <label className="toggle">
            <input type="checkbox" checked={safeZones} onChange={(e) => setSafeZones(e.target.checked)} />
            <span>Show safe zones</span>
          </label>
          <p className="muted small">Shaded areas are where platforms place buttons and captions. Keep faces clear of them.</p>
        </div>
        <div className="row nav-row">
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
          <span className="grow" />
          <button className="btn btn-primary" disabled={tracking} onClick={onNext}>
            Add captions
          </button>
        </div>
      </aside>
    </div>
  )
}

/* ---------- Step 4 ---------- */

function ExportStep({
  project,
  bounds,
  selection,
  clipWords,
  title,
  onStyle,
  beforeRender,
  onBack
}: {
  project: Project
  bounds: { start: number; end: number }
  selection: Selection
  clipWords: Word[]
  title: string
  onStyle: (s: CaptionStyle) => void
  beforeRender: () => Promise<void>
  onBack: () => void
}) {
  const toast = useToast()
  const [stageRef, stage] = useSize<HTMLDivElement>()
  const [rendering, setRendering] = useState(false)
  const [progress, setProgress] = useState(0)
  const [output, setOutput] = useState<string | null>(null)
  const trackValid = project.tracking && project.tracking.start <= bounds.start + 0.5 && project.tracking.end >= bounds.end - 0.5

  useEffect(() => api.onProgress((e) => e.kind === 'render' && setProgress(e.progress)), [])
  useEffect(() => setOutput(null), [project.captionStyle, project.aspect, selection.startWord, selection.endWord])

  const render = async () => {
    setRendering(true)
    setProgress(0)
    try {
      await beforeRender()
      const path = await api.render(
        {
          projectId: project.id,
          startWord: selection.startWord,
          endWord: selection.endWord,
          aspect: project.aspect,
          captionStyle: project.captionStyle,
          tracking: trackValid ? project.tracking : undefined
        },
        title
      )
      if (path) {
        setOutput(path)
        toast.show('Clip rendered and downloaded', 'success', { label: 'Show in Finder', run: () => void api.reveal(path) })
      }
    } catch (err) {
      toast.error(err)
    } finally {
      setRendering(false)
    }
  }

  return (
    <div className="workspace">
      <section className="stage" ref={stageRef}>
        {stage.height > 0 && (
          <FramedPlayer
            src={videoUrl(project.id)}
            srcWidth={project.width}
            srcHeight={project.height}
            clip={bounds}
            aspect={project.aspect}
            tracking={trackValid ? project.tracking : undefined}
            words={clipWords}
            captionStyle={project.captionStyle}
            maxHeight={stage.height - 70}
            maxWidth={stage.width - 48}
          />
        )}
      </section>
      <aside className="side-col">
        <div className="panel">
          <h3>Caption style</h3>
          <div className="style-options">
            {(Object.keys(CAPTION_LOOKS) as CaptionStyle[]).map((s) => {
              const look = CAPTION_LOOKS[s]
              return (
                <button key={s} className={`style-option ${project.captionStyle === s ? 'active' : ''}`} onClick={() => onStyle(s)}>
                  <span
                    className={`style-sample caption-${s}`}
                    style={{ fontFamily: `"${look.font}", sans-serif`, fontWeight: look.weight }}
                  >
                    {look.uppercase ? 'HE IS ' : 'He is '}
                    <span style={{ color: look.activeColor, opacity: 1 }}>{look.uppercase ? 'FAITHFUL' : 'faithful'}</span>
                    {s === 'minimal' && <span style={{ opacity: look.inactiveOpacity }}> to the end</span>}
                  </span>
                  <span className="style-text">
                    <strong>{look.label}</strong>
                    <span className="muted small">{look.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="muted small">Captions are timed word by word and use your corrected transcript.</p>
        </div>
        <div className="panel export-panel">
          <h3>Export</h3>
          <p className="small muted">
            A {formatDuration(bounds.end - bounds.start)} {project.aspect} MP4, ready to post.
          </p>
          {rendering ? (
            <>
              <ProgressBar value={progress} />
              <div className="row">
                <span className="small muted grow">Rendering… {Math.round(progress * 100)}%</span>
                <button className="btn btn-ghost btn-small" onClick={() => void api.cancelRender()}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn-primary btn-large" onClick={render}>
              Render &amp; save clip
            </button>
          )}
          {output && !rendering && (
            <div className="result">
              <Icon name="check" />
              <span className="small grow" title={output}>
                Saved {output.split('/').pop()}
              </span>
              <button className="btn btn-small" onClick={() => void api.reveal(output)}>
                Show in Finder
              </button>
            </div>
          )}
        </div>
        <div className="row nav-row">
          <button className="btn btn-ghost" onClick={onBack}>
            Back
          </button>
        </div>
      </aside>
    </div>
  )
}
