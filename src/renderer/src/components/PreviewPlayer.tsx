import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@shared/transcript'
import { Icon } from './Common'

interface Props {
  src: string
  bounds: { start: number; end: number } | null
  /** Jump request from the transcript (free playback from that point). */
  seek: { time: number; nonce: number } | null
  onTime: (t: number) => void
}

/** Small player: "Play selection" stops at the selection end; fullscreen plays freely. */
export default function PreviewPlayer({ src, bounds, seek, onTime }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const bounded = useRef(false)
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds

  useEffect(() => {
    const v = video.current
    if (!v || !seek) return
    bounded.current = false
    v.currentTime = seek.time
    void v.play()
  }, [seek])

  // When the selection changes, park the playhead at its start.
  useEffect(() => {
    const v = video.current
    if (!v || !bounds) return
    if (!playing || bounded.current) {
      v.pause()
      v.currentTime = bounds.start
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds?.start, bounds?.end])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const v = video.current
      if (v) {
        const b = boundsRef.current
        if (bounded.current && b && v.currentTime >= b.end && !document.fullscreenElement) {
          v.pause()
          v.currentTime = b.end
        }
        setTime(v.currentTime)
        onTime(v.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, onTime])

  const playSelection = () => {
    const v = video.current
    const b = boundsRef.current
    if (!v || !b) return
    bounded.current = true
    if (v.currentTime < b.start || v.currentTime >= b.end - 0.05) v.currentTime = b.start
    void v.play()
  }

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (!v.paused) v.pause()
    else if (bounds) playSelection()
    else void v.play()
  }

  const fullscreen = () => {
    bounded.current = false
    void video.current?.requestFullscreen()
  }

  return (
    <div className="preview">
      <div className="preview-video" onClick={toggle}>
        <video
          ref={video}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onSeeked={(e) => {
            setTime(e.currentTarget.currentTime)
            onTime(e.currentTarget.currentTime)
          }}
          onLoadedMetadata={(e) => {
            if (boundsRef.current) e.currentTarget.currentTime = boundsRef.current.start
          }}
        />
        {!playing && (
          <div className="preview-play">
            <Icon name="play" size={28} />
          </div>
        )}
      </div>
      <div className="preview-bar">
        <button className="icon-btn" onClick={toggle} title={playing ? 'Pause' : 'Play selection'}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <span className="tabular small">
          {formatTime(time)}
          {bounds && <span className="muted"> of clip {formatTime(bounds.start)}–{formatTime(bounds.end)}</span>}
        </span>
        <span className="grow" />
        <button className="icon-btn" onClick={fullscreen} title="Watch fullscreen">
          <Icon name="fullscreen" size={16} />
        </button>
      </div>
    </div>
  )
}
