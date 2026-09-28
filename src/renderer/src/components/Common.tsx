import type { ReactNode } from 'react'

export function Logo({ size = 28 }: { size?: number }) {
  // A page of notes with one line marked: the whole app in a glyph.
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <rect x="4.5" y="2.5" width="23" height="27" rx="2.5" fill="var(--leaf)" stroke="rgba(31, 35, 40, 0.28)" />
      <path d="M8.5 9h15M8.5 23h11" stroke="var(--ink-faint)" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 14.2h18.5l-.8 4.8H6.2z" fill="var(--marker)" />
      <path d="M8.5 16.6h14" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function Brand() {
  return (
    <div className="brand">
      <Logo />
      <span>Sunday Studio</span>
    </div>
  )
}

export function ProgressBar({ value, indeterminate }: { value?: number; indeterminate?: boolean }) {
  return (
    <div className={`progress ${indeterminate || value === undefined ? 'progress-indeterminate' : ''}`}>
      <div className="progress-fill" style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </div>
  )
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children}
    </div>
  )
}

type IconName = 'back' | 'settings' | 'play' | 'pause' | 'fullscreen' | 'sparkle' | 'library' | 'check' | 'trash' | 'edit' | 'upload' | 'target' | 'folder' | 'x'

const ICONS: Record<IconName, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  pause: <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />,
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  library: <path d="M4 5h6v14H4zM14 5h6v6h-6zM14 15h6v4h-6z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />,
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  folder: <path d="M3 6h6l2 2h10v11H3z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}
