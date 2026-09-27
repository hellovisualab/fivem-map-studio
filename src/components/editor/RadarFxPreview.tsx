import { useEffect, useRef, type CSSProperties } from 'react'
import { paintRadarFx } from '@/lib/overlayRuntime'
import { onFrame } from '@/lib/fxTicker'
import { drawHudBackdrop, drawRadar, genericRadarSource, hudLayout, previewHeading, tileRadarRect, type RadarSource } from '@/lib/radarScene'
import type { OverlayFx, OverlayFxId } from '@/types'

/**
 * Animated radar with the overlay effects painted by the same runtime the
 * exported NUI page uses. `hud` shows the bottom-left corner of the game screen,
 * `tile` just the radar.
 */
export function RadarFxPreview({
  fx,
  ids,
  source,
  variant = 'tile',
  fps = 60,
  className,
  style,
}: {
  fx: OverlayFx
  /** Effects to show instead of `fx.ids`. */
  ids?: OverlayFxId[]
  source?: RadarSource | null
  variant?: 'hud' | 'tile'
  fps?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const props = useRef({ fx, ids, source })
  useEffect(() => {
    props.current = { fx, ids, source }
  })

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let visible = true
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
    })
    io.observe(canvas)
    const started = performance.now()
    let last = -Infinity
    const stop = onFrame((now) => {
      // Hidden (display: none) or collapsed previews have nothing to draw into.
      if (!visible || canvas.clientWidth < 8 || canvas.clientHeight < 8 || now - last < 1000 / fps - 4) return
      last = now
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr))
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr))
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      const cur = props.current
      const t = Math.max(0, (now - started) / 1000)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      let radar
      if (variant === 'hud') {
        drawHudBackdrop(ctx, w, h)
        radar = hudLayout(w, h)
      } else {
        radar = tileRadarRect(w, h)
      }
      drawRadar(ctx, radar, cur.source ?? genericRadarSource(), previewHeading(t))
      paintRadarFx(ctx, { ...cur.fx, ids: cur.ids ?? cur.fx.ids }, t, radar)
    })
    return () => {
      stop()
      io.disconnect()
    }
  }, [variant, fps])

  return <canvas ref={ref} className={className} style={style} />
}
