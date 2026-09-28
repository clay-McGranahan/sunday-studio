import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import type { Selection, Word } from '@shared/types'
import { formatTime, paragraphs } from '@shared/transcript'

interface Props {
  words: Word[]
  selection: Selection | null
  activeWord: number
  scrollTo: { word: number; nonce: number } | null
  onSelect: (s: Selection | null) => void
  onSeek: (time: number) => void
  onEditWord: (index: number, text: string) => void
}

type Drag = { mode: 'select'; anchor: number } | { mode: 'start' | 'end' }

export default function TranscriptView({ words, selection, activeWord, scrollTo, onSelect, onSeek, onEditWord }: Props) {
  const paras = useMemo(() => paragraphs(words), [words])
  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const beforeClick = useRef<Selection | null>(null)
  const selRef = useRef(selection)
  selRef.current = selection
  const [editing, setEditing] = useState(-1)
  // Briefly animate the highlight when a moment is chosen from a suggestion.
  const [sweeping, setSweeping] = useState(false)

  const wordAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-i]')
    return el ? Number(el.dataset.i) : null
  }

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const handle = target.closest<HTMLElement>('[data-handle]')
    if (handle && selRef.current) {
      e.preventDefault()
      drag.current = { mode: handle.dataset.handle as 'start' | 'end' }
      return
    }
    const wordEl = target.closest<HTMLElement>('[data-i]')
    if (!wordEl || target.closest('input')) return
    e.preventDefault()
    if (e.detail >= 2) return // double-click: handled by onDoubleClick
    const i = Number(wordEl.dataset.i)
    beforeClick.current = selRef.current
    const sel = selRef.current
    if (e.shiftKey && sel) {
      onSelect({ startWord: Math.min(sel.startWord, i), endWord: Math.max(sel.endWord, i) })
      drag.current = { mode: i < sel.startWord ? 'start' : 'end' }
      return
    }
    drag.current = { mode: 'select', anchor: i }
    onSelect({ startWord: i, endWord: i })
  }

  useEffect(() => {
    const move = (e: globalThis.MouseEvent) => {
      const d = drag.current
      if (!d) return
      const i = wordAt(e.clientX, e.clientY)
      // Scroll the transcript while dragging near its edges.
      const box = containerRef.current?.getBoundingClientRect()
      if (box) {
        if (e.clientY < box.top + 40) containerRef.current!.scrollTop -= 14
        else if (e.clientY > box.bottom - 40) containerRef.current!.scrollTop += 14
      }
      if (i === null) return
      const sel = selRef.current
      if (d.mode === 'select') onSelect({ startWord: Math.min(d.anchor, i), endWord: Math.max(d.anchor, i) })
      else if (sel && d.mode === 'start') onSelect({ startWord: Math.min(i, sel.endWord), endWord: sel.endWord })
      else if (sel && d.mode === 'end') onSelect({ startWord: sel.startWord, endWord: Math.max(i, sel.startWord) })
    }
    const up = () => (drag.current = null)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [onSelect])

  const onDoubleClick = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    if (!el) return
    // The first click of the double-click changed the selection; put it back.
    onSelect(beforeClick.current)
    setEditing(Number(el.dataset.i))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && editing < 0 && !(e.target instanceof HTMLInputElement)) onSelect(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing, onSelect])

  // Scroll only the transcript; scrollIntoView would also shift the page layout out of view.
  useEffect(() => {
    const box = containerRef.current
    const el = box?.querySelector(`[data-i="${scrollTo?.word}"]`)
    if (!box || !el) return
    const offset = el.getBoundingClientRect().top - box.getBoundingClientRect().top
    box.scrollTop += offset - box.clientHeight / 3
    setSweeping(true)
    const t = setTimeout(() => setSweeping(false), 1200)
    return () => clearTimeout(t)
  }, [scrollTo])

  const commitEdit = useCallback(
    (i: number, text: string, next?: 1 | -1) => {
      if (text.trim() && text.trim() !== words[i].text) onEditWord(i, text.trim())
      setEditing(next ? Math.max(0, Math.min(words.length - 1, i + next)) : -1)
    },
    [onEditWord, words]
  )

  return (
    <div className="transcript" ref={containerRef} onMouseDown={onMouseDown} onDoubleClick={onDoubleClick}>
      <div className={`transcript-inner ${sweeping ? 'sweeping' : ''}`}>
        {paras.map((p) => {
          const inSel = selection && selection.endWord >= p.startWord && selection.startWord <= p.endWord
          return (
            <Paragraph
              key={p.startWord}
              words={words}
              startWord={p.startWord}
              endWord={p.endWord}
              selStart={inSel ? selection!.startWord : -1}
              selEnd={inSel ? selection!.endWord : -1}
              active={activeWord >= p.startWord && activeWord <= p.endWord ? activeWord : -1}
              editing={editing >= p.startWord && editing <= p.endWord ? editing : -1}
              onSeek={onSeek}
              onCommit={commitEdit}
              onCancel={() => setEditing(-1)}
            />
          )
        })}
      </div>
    </div>
  )
}

interface ParagraphProps {
  words: Word[]
  startWord: number
  endWord: number
  selStart: number
  selEnd: number
  active: number
  editing: number
  onSeek: (t: number) => void
  onCommit: (i: number, text: string, next?: 1 | -1) => void
  onCancel: () => void
}

const Paragraph = memo(function Paragraph({ words, startWord, endWord, selStart, selEnd, active, editing, onSeek, onCommit, onCancel }: ParagraphProps) {
  const items = []
  for (let i = startWord; i <= endWord; i++) {
    const w = words[i]
    if (i === editing) {
      items.push(<WordEditor key={i} word={w} onCommit={(t, next) => onCommit(i, t, next)} onCancel={onCancel} />)
      items.push(' ')
      continue
    }
    const selected = selStart >= 0 && i >= selStart && i <= selEnd
    const cls = ['w']
    if (selected) cls.push('sel')
    if (i === selStart) cls.push('sel-first')
    if (i === selEnd) cls.push('sel-last')
    if (i === active) cls.push('playing')
    if (w.original) cls.push('corrected')
    else if ((w.confidence ?? 1) < 0.45) cls.push('unsure')
    items.push(
      <span
        key={i}
        className={cls.join(' ')}
        data-i={i}
        title={w.original ? `Heard as “${w.original}”` : undefined}
        style={selected ? ({ '--k': Math.min(i - selStart, 80) } as CSSProperties) : undefined}
      >
        {i === selStart && <span className="handle handle-start" data-handle="start" />}
        {w.text}
        {i === selEnd && <span className="handle handle-end" data-handle="end" />}
      </span>
    )
    items.push(
      selected && i !== selEnd ? (
        <span key={`s${i}`} className="sel-space" style={{ '--k': Math.min(i - selStart, 80) } as CSSProperties}>
          {' '}
        </span>
      ) : (
        ' '
      )
    )
  }
  return (
    <div className="para">
      <button className="para-time" onClick={() => onSeek(words[startWord].start)} title="Jump to this point in the video">
        {formatTime(words[startWord].start)}
      </button>
      <p>{items}</p>
    </div>
  )
})

function WordEditor({ word, onCommit, onCancel }: { word: Word; onCommit: (t: string, next?: 1 | -1) => void; onCancel: () => void }) {
  const [value, setValue] = useState(word.text)
  const ref = useRef<HTMLInputElement>(null)
  // Enter/Tab/Escape unmount the input, which also fires blur; only act once.
  const done = useRef(false)
  const finish = (fn: () => void) => {
    if (done.current) return
    done.current = true
    fn()
  }
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="word-edit"
      value={value}
      style={{ width: `${Math.max(3, value.length + 1)}ch` }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(() => onCommit(value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(() => onCommit(value))
        else if (e.key === 'Escape') finish(onCancel)
        else if (e.key === 'Tab') {
          e.preventDefault()
          finish(() => onCommit(value, e.shiftKey ? -1 : 1))
        }
      }}
    />
  )
}
