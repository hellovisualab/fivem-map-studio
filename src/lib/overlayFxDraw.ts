import type { OverlayFx, OverlayFxId } from '@/types'
import { rgba } from './utils'

function wave(t: number, period: number) {
  return 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2)
}

function heartbeat(t: number, period: number) {
  const p = (t % period) / period
  const g = (x: number, c: number, w: number) => Math.exp((-((x - c) ** 2)) / w)
  return Math.min(1, g(p, 0.14, 0.0038) + g(p, 0.3, 0.0032))
}

export function drawMiniMap(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const bg = ctx.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#16382c')
  bg.addColorStop(0.45, '#0c141c')
  bg.addColorStop(1, '#12283c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#2f6f52'
  ctx.beginPath()
  ctx.ellipse(w * 0.5, h * 0.54, w * 0.4, h * 0.34, -0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#1f4d38'
  ctx.beginPath()
  ctx.ellipse(w * 0.38, h * 0.42, w * 0.16, h * 0.14, 0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(248, 180, 208, 0.85)'
  ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.02)
  ctx.beginPath()
  ctx.moveTo(w * 0.18, h * 0.72)
  ctx.quadraticCurveTo(w * 0.42, h * 0.5, w * 0.78, h * 0.3)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'
  ctx.strokeRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8)
}

export function paintOverlayFx(ctx: CanvasRenderingContext2D, fx: OverlayFx, timeSec: number, w: number, h: number) {
  const i = fx.intensity
  const color = fx.color
  const t = timeSec
  const u = Math.max(1, Math.min(w, h) / 90)
  for (const id of fx.ids) paintOne(ctx, id, t, w, h, i, color, u)
}

function paintOne(ctx: CanvasRenderingContext2D, id: OverlayFxId, t: number, w: number, h: number, i: number, color: string, u: number) {
  ctx.save()
  switch (id) {
    case 'pulse': {
      ctx.fillStyle = `rgba(0,0,0,${(0.12 + i * 0.32) * (1 - wave(t, 1.6))})`
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'glow': {
      const k = wave(t, 1.5)
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = (10 + 22 * k) * i * u
      ctx.lineWidth = (3 + 3 * k) * u
      ctx.strokeRect(u * 2, u * 2, w - u * 4, h - u * 4)
      break
    }
    case 'breathe': {
      const k = wave(t, 2.6)
      ctx.strokeStyle = rgba(color, 0.15 + k * i * 0.45)
      ctx.lineWidth = (2 + 6 * k * i) * u
      ctx.strokeRect(u, u, w - u * 2, h - u * 2)
      break
    }
    case 'scanlines': {
      const gap = Math.max(3, 3.4 * u)
      const off = (t * 42) % gap
      ctx.fillStyle = `rgba(0,0,0,${0.28 + i * 0.4})`
      for (let y = -off; y < h; y += gap) ctx.fillRect(0, y, w, Math.max(1, gap * 0.45))
      ctx.fillStyle = `rgba(255,255,255,${0.04 + i * 0.05})`
      for (let y = -off; y < h; y += gap) ctx.fillRect(0, y, w, 1)
      break
    }
    case 'radar': {
      ctx.translate(w / 2, h / 2)
      ctx.rotate((t / 2.6) * Math.PI * 2)
      const g = ctx.createConicGradient(-Math.PI / 2, 0, 0)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(0.72, 'rgba(0,0,0,0)')
      g.addColorStop(0.9, rgba(color, 0.15 * i))
      g.addColorStop(1, rgba(color, 0.75 * i))
      ctx.fillStyle = g
      const r = Math.hypot(w, h)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = rgba(color, 0.9 * i)
      ctx.lineWidth = Math.max(1.5, u)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(0, -r)
      ctx.stroke()
      break
    }
    case 'flicker': {
      const step = Math.floor(t * 14)
      const flash = (step * 17) % 11 === 0 || (step * 13) % 19 === 0
      if (flash) {
        ctx.fillStyle = `rgba(0,0,0,${0.45 + i * 0.4})`
        ctx.fillRect(0, 0, w, h)
        ctx.fillStyle = rgba(color, 0.2 * i)
        ctx.fillRect(0, 0, w, h)
      }
      break
    }
    case 'heartbeat': {
      const k = heartbeat(t, 1.25)
      ctx.fillStyle = rgba(color, k * i * 0.28)
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = rgba(color, k * i)
      ctx.lineWidth = (2 + 8 * k) * u
      ctx.strokeRect(u, u, w - u * 2, h - u * 2)
      break
    }
    case 'shimmer': {
      const p = (t / 2.1) % 1
      const x = (p * 1.6 - 0.3) * w
      const g = ctx.createLinearGradient(x, 0, x + w * 0.4, h)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.5, rgba(color, 0.55 * i))
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'ripple': {
      const rings = 2
      for (let n = 0; n < rings; n++) {
        const p = (t / 2.2 + n * 0.5) % 1
        ctx.beginPath()
        ctx.arc(w / 2, h / 2, (0.08 + p * 0.55) * Math.max(w, h), 0, Math.PI * 2)
        ctx.strokeStyle = rgba(color, (1 - p) * i * 0.9)
        ctx.lineWidth = Math.max(1.5, (3 - p * 2) * u)
        ctx.stroke()
      }
      break
    }
    case 'hue': {
      ctx.fillStyle = `hsla(${(t * 90) % 360}, 100%, 50%, ${0.18 + i * 0.22})`
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'glitch': {
      const p = t % 2.2
      if (p > 1.85) {
        const j = (p - 1.85) / 0.35
        ctx.fillStyle = `rgba(255, 0, 80, ${0.35 * i})`
        ctx.fillRect(Math.sin(t * 50) * 10 * i, h * 0.28, w, 6 * u)
        ctx.fillStyle = `rgba(0, 220, 255, ${0.35 * i})`
        ctx.fillRect(-Math.sin(t * 40) * 10 * i, h * 0.55, w, 5 * u)
        ctx.translate((j - 0.5) * 12 * i, 0)
        ctx.fillStyle = rgba(color, 0.12)
        ctx.fillRect(0, 0, w, h)
      }
      break
    }
    case 'vignette': {
      const k = wave(t, 2.2)
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.15, w / 2, h / 2, Math.max(w, h) * 0.72)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, `rgba(0,0,0,${0.35 + k * i * 0.55})`)
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      break
    }
  }
  ctx.restore()
}
