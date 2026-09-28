import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import type { Project } from '@shared/types'
import { formatBytes, formatDuration } from '@shared/transcript'
import { Brand, Icon, ProgressBar, Spinner } from '../components/Common'
import { api, type VideoSource } from '../lib/api'
import type { ProjectRow } from '../lib/backend'
import { useToast } from '../lib/toast'

type Row = ProjectRow

interface Props {
  aiConfigured: boolean
  onOpen: (id: string) => void
  onSettings: () => void
}

const STATUS_LABEL: Record<Project['status'], string> = {
  queued: 'Waiting',
  preparing: 'Preparing',
  transcribing: 'Transcribing',
  ready: 'Ready',
  error: 'Needs attention'
}

export default function Projects({ aiConfigured, onOpen, onSettings }: Props) {
  const toast = useToast()
  const [projects, setProjects] = useState<Row[] | null>(null)
  const [live, setLive] = useState<Record<string, { progress?: number; message?: string }>>({})
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [upload, setUpload] = useState<number | null>(null)
  const dragDepth = useRef(0)

  const refresh = useCallback(() => api.listProjects().then(setProjects, toast.error), [toast.error])

  useEffect(() => {
    void refresh()
    return api.onProgress((e) => {
      if (e.kind !== 'project') return
      setLive((l) => ({ ...l, [e.projectId]: { progress: e.progress, message: e.message } }))
      if (e.status === 'ready' || e.status === 'error') {
        void refresh()
        if (e.status === 'error' && e.message) toast.show(e.message, 'error')
      } else {
        setProjects((ps) => ps?.map((p) => (p.id === e.projectId ? { ...p, status: e.status } : p)) ?? ps)
      }
    })
  }, [refresh, toast])

  const importVideo = async (source: VideoSource) => {
    setImporting(true)
    setUpload(source.kind === 'file' ? 0 : null)
    try {
      const project = await api.createProject(source, setUpload)
      toast.show(`Added “${project.name}”. Transcribing now.`, 'success')
      onOpen(project.id)
    } catch (err) {
      toast.error(err)
    } finally {
      setImporting(false)
      setUpload(null)
    }
  }

  const choose = async () => {
    if (importing) return
    const source = await api.chooseVideo().catch(toast.error)
    if (source) await importVideo(source)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && !importing) void importVideo(api.sourceFromFile(file))
  }

  return (
    <div
      className="page"
      onDragEnter={(e) => {
        e.preventDefault()
        dragDepth.current++
        setDragging(true)
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <header className="topbar">
        <Brand />
        <span />
        <button className="btn btn-ghost btn-icon-text" onClick={onSettings}>
          <Icon name="settings" /> Settings
        </button>
      </header>

      <main className="projects">
        <section className={`dropzone ${dragging ? 'is-dragging' : ''}`} onClick={choose} role="button" tabIndex={0}>
          {importing ? (
            <>
              <div className="dropzone-icon">
                <Spinner />
              </div>
              <h2>{upload !== null && upload < 1 ? `Uploading your video… ${Math.round(upload * 100)}%` : 'Reading your video…'}</h2>
              {upload !== null && upload < 1 ? <ProgressBar value={upload} /> : <p className="muted">This takes a few seconds.</p>}
            </>
          ) : (
            <>
              <div className="dropzone-icon">
                <Icon name="upload" size={26} />
              </div>
              <h2>Bring in a sermon</h2>
              <p className="muted">Drag a video here, or click to choose. MP4, MOV or WebM, up to about 3 hours.</p>
            </>
          )}
        </section>

        {!aiConfigured && projects && projects.length > 0 && (
          <div className="notice">
            <Icon name="sparkle" />
            <span>Connect an AI service in Settings to get suggested clips for each sermon.</span>
            <button className="btn btn-small btn-ghost" onClick={onSettings}>
              Set up
            </button>
          </div>
        )}

        <div className="section-head">
          <h3>Projects</h3>
          {projects && <span className="muted small">{projects.length} {api.storageLabel}</span>}
        </div>

        {!projects ? (
          <Spinner />
        ) : projects.length === 0 ? (
          <p className="muted empty-line">Your sermons will appear here once you bring one in.</p>
        ) : (
          <div className="sermon-list">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                live={live[p.id]}
                onOpen={() => onOpen(p.id)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </main>
      {dragging && <div className="drop-overlay">Drop to bring in this sermon</div>}
    </div>
  )
}

function ProjectCard({
  project: p,
  live,
  onOpen,
  onChanged
}: {
  project: Row
  live?: { progress?: number; message?: string }
  onOpen: () => void
  onChanged: () => void
}) {
  const toast = useToast()
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(p.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const busy = p.status !== 'ready' && p.status !== 'error'

  const rename = async () => {
    setRenaming(false)
    if (name.trim() && name.trim() !== p.name) {
      await api.updateProject(p.id, { name: name.trim() }).catch(toast.error)
      onChanged()
    } else setName(p.name)
  }

  const remove = async () => {
    await api.deleteProject(p.id).catch(toast.error)
    toast.show(`Deleted “${p.name}”. The original video was not touched.`)
    onChanged()
  }

  return (
    <article className="sermon-row" onClick={() => !renaming && !confirmDelete && onOpen()}>
      <div className="thumb">
        <img src={api.thumbUrl(p.id, p.status)} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
      </div>
      <div className="sermon-body">
        {renaming ? (
          <input
            className="rename"
            autoFocus
            value={name}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void rename()
              if (e.key === 'Escape') {
                setName(p.name)
                setRenaming(false)
              }
            }}
          />
        ) : (
          <h4 title={p.name}>{p.name}</h4>
        )}
        <div className="meta-row">
          <span>{new Date(p.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          <span>{formatDuration(p.duration)}</span>
          <span>{formatBytes(p.sourceSize)}</span>
        </div>
        {busy ? (
          <div className="project-progress">
            <ProgressBar value={live?.progress} indeterminate={live?.progress === undefined || live.progress === 0} />
            <span className="small muted">{live?.message ?? STATUS_LABEL[p.status]}</span>
          </div>
        ) : (
          <div className="project-status">
            <span className={`pill ${p.status === 'ready' ? 'pill-ok' : 'pill-error'}`}>{STATUS_LABEL[p.status]}</span>
            <span className="small muted">
              {p.status === 'error'
                ? p.statusMessage
                : p.suggestions.length
                  ? `${p.suggestions.length} ${p.suggestions.length === 1 ? 'moment' : 'moments'} found`
                  : 'No clips found yet'}
            </span>
          </div>
        )}
      </div>
      <div className="card-actions" onClick={(e) => e.stopPropagation()}>
        {confirmDelete ? (
          <>
            <span className="small">Delete project?</span>
            <button className="btn btn-small btn-danger" onClick={remove}>
              Delete
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" title="Rename" onClick={() => setRenaming(true)}>
              <Icon name="edit" size={16} />
            </button>
            <button className="icon-btn" title="Delete" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
    </article>
  )
}
