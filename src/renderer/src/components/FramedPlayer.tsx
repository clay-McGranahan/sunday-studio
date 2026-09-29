import { useEffect, useMemo, useRef, useState } from 'react'
import type { Aspect, CaptionOptions, CaptionStyle, Tracking, Word } from '@shared/types'
import { cropAt, OUTPUT_SIZE, SAFE_ZONES } from '@shared/framing'
import { captionPages, captionPlacement, captionsEnabled, formatTime, resolveLook } from '@shared/transcript'
import { Icon } from './Common'

interface Props {
  src: string
  srcWidth: number
  srcHeight: number
  clip: { start: number; end: number }
  aspect: Aspect
  tracking?: Tracking
  /** Words in the clip; captions are drawn when a style is given. */
  words?: Word[]
  captionStyle?: CaptionStyle
  captionOptions?: CaptionOptions
  /** When given, the captions can be dragged in the preview; called once when the drag ends. */
  onCaptionMove?: (position: { x: number; y: number }) => void
  showSafeZones?: boolean
  /** Max preview size in CSS pixels. */
  maxHeight: number
  maxWidth: number
}

/** Plays the clip in a loop, cropped and tracked exactly as it will render. */
export default function FramedPlayer(props: Props) {
  const { src, srcWidth, srcHeight, clip, aspect, tracking, words, captionStyle, captionOptions, onCaptionMove, showSafeZones, maxHeight, maxWidth } = props
  const box = useRef<HTMLDivElement>(null)
  // While a caption is being dragged, the preview follows the pointer; the position is saved when it's released.
  const [drag, setDrag] = useState<{ x: number; y: number; snapped: boolean } | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0) // seconds from clip start

  const out = OUTPUT_SIZE[aspect]
  const scaleToFit = Math.min(maxHeight / out.height, maxWidth / out.width)
  const boxW = Math.round(out.width * scaleToFit)
  const boxH = Math.round(out.height * scaleToFit)

  const usableTracking = tracking && tracking.start <= clip.start + 0.5 && tracking.end >= clip.end - 0.5 ? tracking : undefined
  const relTracking = useMemo(
    () => (usableTracking ? { ...usableTracking, start: 0, points: usableTracking.points.map((p) => ({ ...p, t: p.t - clip.start })) } : undefined),
    [usableTracking, clip.start]
  )
  const crop = cropAt(srcWidth, srcHeight, aspect, relTracking, t)
  const s = boxH / crop.height

  const pages = useMemo(() => (words && captionStyle ? captionPages(words, captionStyle) : []), [words, captionStyle])
  const showCaptions = Boolean(captionStyle) && captionsEnabled(captionOptions)
  const liveOptions: CaptionOptions | undefined = drag ? { ...captionOptions, x: drag.x, y: drag.y } : captionOptions

  const startDrag = (e: React.PointerEvent) => {
    if (!onCaptionMove || !box.current) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: captionPlacement(captionStyle!, aspect, captionOptions).x, y: captionPlacement(captionStyle!, aspect, captionOptions).y, snapped: false })
  }
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || !box.current) return
    const r = box.current.getBoundingClientRect()
    let x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    const snapped = Math.abs(x - 0.5) < 0.025
    if (snapped) x = 0.5
    setDrag({ x, y, snapped })
  }
  const endDrag = () => {
    if (!drag) return
    const placed = captionPlacement(captionStyle!, aspect, { x: drag.x, y: drag.y })
    setDrag(null)
    onCaptionMove?.({ x: Number(placed.x.toFixed(3)), y: Number(placed.y.toFixed(3)) })
  }

  useEffect(() => {
    const v = video.current
    if (!v) return
    v.pause()
    v.currentTime = clip.start
    setT(0)
  }, [clip.start, clip.end, src])

  useEffect(() => {
    if (!playing) return
    let raf = 0
    const tick = () => {
      const v = video.current
      if (v) {
        if (v.currentTime >= clip.end || v.currentTime < clip.start - 0.5) v.currentTime = clip.start
        setT(Math.max(0, v.currentTime - clip.start))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clip.start, clip.end])

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const scrub = (value: number) => {
    const v = video.current
    if (!v) return
    v.currentTime = clip.start + value
    setT(value)
  }

  const duration = clip.end - clip.start
  const safe = SAFE_ZONES[aspect]

  return (
    <div className="framed" style={{ width: boxW }}>
      <div ref={box} className={`framed-box ${drag ? 'is-dragging' : ''}`} style={{ width: boxW, height: boxH }} onClick={toggle}>
        <video
          ref={video}
          src={src}
          preload="auto"
          style={{
            width: srcWidth * s,
            height: srcHeight * s,
            transform: `translate(${-crop.x * s}px, ${-crop.y * s}px)`
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onSeeked={(e) => setT(Math.max(0, e.currentTarget.currentTime - clip.start))}
          onLoadedMetadata={(e) => (e.currentTarget.currentTime = clip.start)}
        />
        {drag && (
          <div className="guides" aria-hidden="true">
            <i className={`guide-v ${drag.snapped ? 'on' : ''}`} />
          </div>
        )}
        {showCaptions && (
          <CaptionOverlay
            pages={pages}
            time={clip.start + t}
            style={captionStyle!}
            options={liveOptions}
            aspect={aspect}
            boxH={boxH}
            draggable={Boolean(onCaptionMove)}
            handlers={{ onPointerDown: startDrag, onPointerMove: moveDrag, onPointerUp: endDrag, onPointerCancel: endDrag }}
          />
        )}
        {showSafeZones && (
          <div className="safe-zones" aria-hidden="true">
            <div style={{ top: 0, left: 0, right: 0, height: `${safe.top * 100}%` }} />
            <div style={{ bottom: 0, left: 0, right: 0, height: `${safe.bottom * 100}%` }} />
            <div style={{ top: `${safe.top * 100}%`, bottom: `${safe.bottom * 100}%`, right: 0, width: `${safe.right * 100}%` }} />
            <div style={{ top: `${safe.top * 100}%`, bottom: `${safe.bottom * 100}%`, left: 0, width: `${safe.left * 100}%` }} />
          </div>
        )}
        {!playing && (
          <div className="preview-play">
            <Icon name="play" size={32} />
          </div>
        )}
      </div>
      <div className="framed-bar">
        <button className="icon-btn" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <input type="range" min={0} max={duration} step={0.01} value={Math.min(t, duration)} onChange={(e) => scrub(Number(e.target.value))} />
        <span className="tabular small muted">
          {formatTime(t)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}

function CaptionOverlay({
  pages,
  time,
  style,
  options,
  aspect,
  boxH,
  draggable,
  handlers
}: {
  pages: ReturnType<typeof captionPages>
  time: number
  style: CaptionStyle
  options?: CaptionOptions
  aspect: Aspect
  boxH: number
  draggable: boolean
  handlers: Pick<React.HTMLAttributes<HTMLDivElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'>
}) {
  const look = resolveLook(style, options)
  const place = captionPlacement(style, aspect, options)
  let page = pages.find((p) => time >= p.start && time < p.end)
  // While positioning, keep the nearest caption on screen so there is always something to grab.
  if (!page && draggable && pages.length) {
    const distance = (p: (typeof pages)[number]) => (time < p.start ? p.start - time : time - p.end)
    page = pages.reduce((best, p) => (distance(p) < distance(best) ? p : best))
  }
  if (!page) return null
  // Mirrors the ASS built for rendering in src/shared/render.ts.
  const fontSize = look.size * boxH * (aspect === '16:9' ? 1.15 : 1)
  const activeIndex = page.words.findIndex((w, i) => time >= (i === 0 ? page!.start : w.start) && time < (page!.words[i + 1]?.start ?? page!.end))
  return (
    <div
      className={`caption caption-${style} ${draggable ? 'caption-draggable' : ''}`}
      key={draggable ? 'movable' : page.start}
      {...(draggable ? handlers : {})}
      style={{
        left: `${place.x * 100}%`,
        top: `${place.y * 100}%`,
        width: `${place.halfWidth * 200}%`,
        fontFamily: `"${look.font}", sans-serif`,
        fontWeight: look.weight,
        fontSize,
        WebkitTextStroke: look.outline ? `${look.outline * boxH * 2}px ${look.outlineColor}` : undefined,
        textShadow: `0 ${look.shadow * boxH}px ${look.shadow * boxH * 2}px rgba(0,0,0,0.7)`
      }}
    >
      {page.words.map((w, i) => (
        <span
          key={i}
          style={{
            color: i === activeIndex && look.activeColor !== look.color ? look.activeColor : look.color,
            opacity: i > activeIndex ? look.inactiveOpacity : 1
          }}
        >
          {look.uppercase ? w.text.toUpperCase() : w.text}{' '}
        </span>
      ))}
    </div>
  )
}
