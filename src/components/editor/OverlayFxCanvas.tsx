import { useEffect, useRef, type CSSProperties } from 'react'
import { drawMiniMap, paintOverlayFx } from '@/lib/overlayFxDraw'
import type { OverlayFx, OverlayFxId } from '@/types'

export function OverlayFxCanvas({
  fx,
  ids,
  backdrop,
  className,
  style,
  pixelCap,
}: {
  fx: OverlayFx
  ids?: OverlayFxId[]
  backdrop?: CanvasImageSource | 'mini' | null
  className?: string
  style?: CSSProperties
  pixelCap?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef(fx)
  const idsRef = useRef(ids)
  const backdropRef = useRef(backdrop)
  const capRef = useRef(pixelCap)
  fxRef.current = fx
  idsRef.current = ids
  backdropRef.current = backdrop
  capRef.current = pixelCap

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return
    let raf = 0
    const started = performance.now()
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      let nextW = Math.max(1, Math.round(canvas.clientWidth * dpr))
      let nextH = Math.max(1, Math.round(canvas.clientHeight * dpr))
      const cap = capRef.current
      if (cap) {
        const s = Math.min(1, cap / Math.max(nextW, nextH, 1))
        nextW = Math.max(1, Math.round(nextW * s))
        nextH = Math.max(1, Math.round(nextH * s))
      }
      if (canvas.width !== nextW) canvas.width = nextW
      if (canvas.height !== nextH) canvas.height = nextH
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)
    const loop = (now: number) => {
      const cur = fxRef.current
      const activeIds = idsRef.current ?? cur.ids
      const t = ((now - started) / 1000) * cur.speed
      const w = canvas.width
      const h = canvas.height
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const bg = backdropRef.current
      if (bg === 'mini') drawMiniMap(ctx, w, h)
      else if (bg) ctx.drawImage(bg, 0, 0, w, h)
      if (activeIds.length) paintOverlayFx(ctx, { ...cur, ids: activeIds }, t, w, h)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} style={style} />
}
