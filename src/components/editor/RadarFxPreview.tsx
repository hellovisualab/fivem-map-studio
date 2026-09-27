import { useEffect, useRef, type CSSProperties } from 'react'
import { paintRadarFx, type RadarSurface } from '@/lib/overlayRuntime'
import { onFrame } from '@/lib/fxTicker'
import {
  BIGMAP_VIEW_WORLD,
  drawHudBackdrop,
  drawPauseScreen,
  drawRadar,
  genericRadarSource,
  hudLayout,
  previewHeading,
  tileRadarRect,
  type RadarSource,
} from '@/lib/radarScene'
import type { OverlayFx, OverlayFxId } from '@/types'

/**
 * Animated in-game map with the overlay effects painted by the same runtime the
 * exported NUI page uses. `hud` shows the game screen around `surface` (radar,
 * expanded radar or pause menu map); `tile` just a radar.
 */
export function RadarFxPreview({
  fx,
  ids,
  source,
  variant = 'tile',
  surface = 'radar',
  fps = 60,
  className,
  style,
}: {
  fx: OverlayFx
  /** Effects to show instead of `fx.ids`. */
  ids?: OverlayFxId[]
  source?: RadarSource | null
  variant?: 'hud' | 'tile'
  surface?: RadarSurface
  fps?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const props = useRef({ fx, ids, source, surface })
  useEffect(() => {
    props.current = { fx, ids, source, surface }
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
      const src = cur.source ?? genericRadarSource()
      const fx = { ...cur.fx, ids: cur.ids ?? cur.fx.ids }
      if (variant === 'hud') {
        const layout = hudLayout(w, h, cur.surface)
        if (cur.surface === 'pause') {
          drawPauseScreen(ctx, layout.screen, src)
        } else {
          drawHudBackdrop(ctx, w, h)
          const bigmap = cur.surface === 'bigmap'
          // Blips and bars keep their normal-radar size on the expanded radar (2.3374 vs 5.674).
          drawRadar(ctx, layout.rect, src, previewHeading(t), bigmap ? BIGMAP_VIEW_WORLD : undefined, bigmap ? (layout.rect.h * 2.3374) / 5.674 : undefined)
        }
        paintRadarFx(ctx, fx, t, layout.rect, layout.unit)
      } else {
        const radar = tileRadarRect(w, h)
        drawRadar(ctx, radar, src, previewHeading(t))
        paintRadarFx(ctx, fx, t, radar)
      }
    })
    return () => {
      stop()
      io.disconnect()
    }
  }, [variant, fps])

  return <canvas ref={ref} className={className} style={style} />
}
