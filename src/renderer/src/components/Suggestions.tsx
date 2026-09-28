import { useState } from 'react'
import type { Suggestion, Word } from '@shared/types'
import { formatDuration, formatTime, spanText } from '@shared/transcript'
import { Icon, Spinner } from './Common'

const EXAMPLES = ['The strongest self-contained moments for social media', 'Hope after loss', 'A clear call to action', 'A memorable story']

interface PanelProps {
  suggestions: Suggestion[]
  lastQuery?: string
  aiConfigured: boolean
  selectedId: string | null
  onRun: (query: string) => Promise<void>
  onPick: (s: Suggestion) => void
  onSettings: () => void
}

export function SuggestionsPanel({ suggestions, lastQuery, aiConfigured, selectedId, onRun, onPick, onSettings }: PanelProps) {
  const [query, setQuery] = useState(lastQuery ?? '')
  const [running, setRunning] = useState(false)
  // Show the most recent run here; the clip library keeps them all.
  const latest = suggestions.filter((s) => s.createdAt === suggestions[0]?.createdAt)

  const run = async (q = query) => {
    setRunning(true)
    try {
      await onRun(q)
    } finally {
      setRunning(false)
    }
  }

  if (!aiConfigured) {
    return (
      <div className="panel suggestions">
        <div className="panel-head">
          <Icon name="sparkle" />
          <h3>Find moments with AI</h3>
        </div>
        <p className="muted small">
          Describe what you’re looking for and get a ranked list of moments. Only the transcript text is sent.
        </p>
        <button className="btn btn-small" onClick={onSettings}>
          Connect an AI service
        </button>
      </div>
    )
  }

  return (
    <div className="panel suggestions">
      <div className="panel-head">
        <Icon name="sparkle" />
        <h3>Find moments with AI</h3>
      </div>
      <form
        className="suggest-form"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. hope after loss"
          disabled={running}
        />
        <button className="btn btn-primary btn-small" disabled={running}>
          {running ? <Spinner /> : 'Find'}
        </button>
      </form>
      {!suggestions.length && !running && (
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="chip"
              onClick={() => {
                setQuery(ex)
                void run(ex)
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}
      {running && <p className="muted small">Reading the sermon… this usually takes 15–60 seconds.</p>}
      <div className="suggestion-list">
        {latest.map((s, rank) => (
          <SuggestionCard key={s.id} s={s} rank={rank + 1} selected={s.id === selectedId} onClick={() => onPick(s)} />
        ))}
      </div>
    </div>
  )
}

function SuggestionCard({ s, rank, selected, onClick }: { s: Suggestion; rank?: number; selected: boolean; onClick: () => void }) {
  return (
    <button className={`suggestion ${selected ? 'is-selected' : ''}`} onClick={onClick}>
      <div className="suggestion-top">
        {rank !== undefined && <span className="rank">{rank}</span>}
        <span className="suggestion-title">{s.title}</span>
        <span className="score" title="Match score">
          {s.score}
        </span>
      </div>
      <p className="suggestion-reason">{s.reason}</p>
      <div className="suggestion-meta tabular">
        {formatTime(s.start)}–{formatTime(s.end)}, {formatDuration(s.end - s.start)}
      </div>
    </button>
  )
}

interface LibraryProps {
  suggestions: Suggestion[]
  words: Word[]
  onEdit: (s: Suggestion) => void
  onRemove: (s: Suggestion) => void
  onClose: () => void
}

export function ClipLibrary({ suggestions, words, onEdit, onRemove, onClose }: LibraryProps) {
  const [sort, setSort] = useState<'score' | 'time'>('score')
  const sorted = [...suggestions].sort((a, b) => (sort === 'score' ? b.score - a.score : a.start - b.start))
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <h2>Clip library</h2>
            <p className="muted small">Every moment suggested for this sermon.</p>
          </div>
          <div className="segmented small">
            <button className={sort === 'score' ? 'active' : ''} onClick={() => setSort('score')}>
              Best match
            </button>
            <button className={sort === 'time' ? 'active' : ''} onClick={() => setSort('time')}>
              In order
            </button>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {!sorted.length ? (
          <p className="muted empty-line">No moments yet. Use “Find moments with AI” in step 2 to fill your library.</p>
        ) : (
          <div className="library-grid">
            {sorted.map((s) => (
              <article key={s.id} className="library-card">
                <div className="suggestion-top">
                  <span className="suggestion-title">{s.title}</span>
                  <span className="score">{s.score}</span>
                </div>
                <div className="suggestion-meta tabular">
                  {formatTime(s.start)}–{formatTime(s.end)}, {formatDuration(s.end - s.start)}
                </div>
                <blockquote>“{spanText(words, s)}”</blockquote>
                <p className="suggestion-reason">{s.reason}</p>
                <div className="library-foot">
                  <span className="muted small" title="What you asked for">
                    {s.query}
                  </span>
                  <button className="icon-btn" title="Remove from library" onClick={() => onRemove(s)}>
                    <Icon name="trash" size={15} />
                  </button>
                  <button className="btn btn-small btn-primary" onClick={() => onEdit(s)}>
                    Edit clip
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
