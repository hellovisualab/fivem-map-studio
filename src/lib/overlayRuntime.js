// Radar overlay effects, shared by the editor preview and the exported FiveM NUI
// page (html/overlay.js, where the `export` keywords are stripped). Keep this file
// plain ES2019 without imports: it runs unchanged in the game's embedded browser.

const TAU = Math.PI * 2

/** Room kept around a surface for outer glows, in effect units (see `surfaceUnit`). */
export const FX_BLEED_UNITS = 30

/**
 * Screen rectangle of the vanilla radar, in pixels. Radar size measured by
 * glitchdetector (fivem-minimap-anchor): width = screen height / 4, height =
 * screen height / 5.674, inset by the safe zone (5% per 0.1 below 1.0). On
 * screens wider than 16:9 the HUD stays inside a centred 16:9 area.
 */
export function minimapRect(resX, resY, safeZone) {
  return hudCorner(resX, resY, safeZone, resY / 4, resY / 5.674)
}

/**
 * The expanded radar (IS_BIGMAP_ACTIVE, Z in GTA Online): same corner, height / 2.52
 * wide and height / 2.3374 tall, as measured by Boost-DynamicHud.
 */
export function bigmapRect(resX, resY, safeZone) {
  return hudCorner(resX, resY, safeZone, resY / 2.52, resY / 2.3374)
}

/** The full-screen pause menu map, inset by the safe zone (at least 1.5% of the height). */
export function pauseMapRect(resX, resY, safeZone) {
  const margin = (1 - safeZone) * 0.5
  const ix = Math.max(resX * margin, resY * 0.015)
  const iy = Math.max(resY * margin, resY * 0.015)
  return { x: ix, y: iy, w: resX - ix * 2, h: resY - iy * 2 }
}

function hudCorner(resX, resY, safeZone, w, h) {
  const margin = (1 - safeZone) * 0.5
  const hudW = Math.min(resX, (resY * 16) / 9)
  const hudX = (resX - hudW) / 2
  return { x: hudX + hudW * margin, y: resY * (1 - margin) - h, w, h }
}

/**
 * Pixel size of one effect unit on a surface: 1% of the radar height, so lines and
 * glows keep the radar's weight; the larger maps get 1.6× that.
 */
export function surfaceUnit(surface, resY) {
  const radar = resY / 5.674 / 100
  return surface === 'radar' ? radar : radar * 1.6
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  const n = m ? parseInt(m[1], 16) : 0xec4899
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const rgba = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${clamp(a, 0, 1).toFixed(3)})`
const mix = (c, d, k) => [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k]
const WHITE = [255, 255, 255]
const BLACK = [0, 0, 0]

function rotateHue(c, deg) {
  const r = c[0] / 255
  const g = c[1] / 255
  const b = c[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  h = (h * 60 + deg + 360) % 360
  const C = (1 - Math.abs(2 * l - 1)) * s
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - C / 2
  const seg = Math.floor(h / 60)
  const [r1, g1, b1] = [
    [C, X, 0],
    [X, C, 0],
    [0, C, X],
    [0, X, C],
    [X, 0, C],
    [C, 0, X],
  ][seg % 6]
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

/** 0 → 1 → 0 sine wave with the given period (seconds). */
const wave = (t, period) => 0.5 + 0.5 * Math.sin((t / period) * TAU)

/** Two sharp bumps per period ("lub-dub"), in step with the ECG trace below. */
function beat(t, period) {
  const p = (t % period) / period
  const bump = (c, w) => Math.exp(-((p - c) ** 2) / w)
  return Math.min(1, bump(0.1, 0.0016) + 0.75 * bump(0.3, 0.0022))
}

/** Deterministic pseudo random number in [0, 1). */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

function rrect(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

/** Normalized electrocardiogram trace (P wave, QRS spike, T wave) for phase 0–1. */
function ecg(p) {
  const g = (c, w, a) => a * Math.exp(-((p - c) ** 2) / w)
  return g(0.03, 0.0006, 0.12) - g(0.08, 0.00004, 0.18) + g(0.1, 0.0001, 1) - g(0.122, 0.00005, 0.3) + g(0.3, 0.0022, 0.24)
}

function flickerAmount(t, intensity) {
  const s = Math.floor(t * 16)
  const a = hash(s)
  if (a > 0.92) return intensity * (0.55 + 0.45 * hash(s + 0.5))
  if (a > 0.84) return intensity * 0.22
  return 0
}

const glitchActive = (t) => (t % 2.4) / 2.4 > 0.82

/**
 * Paints the selected effects over a map surface occupying `r` ({ x, y, w, h } in
 * canvas pixels): the radar, the expanded radar or the pause menu map. Inner
 * effects are clipped to it; frame effects bleed around it.
 *
 * @param fx { ids: string[], intensity: 0–1, speed: 0.25–3, color: '#rrggbb' }
 * @param seconds Elapsed wall-clock time; the speed setting is applied here.
 * @param unit Pixels per effect unit (line widths, glows); 1% of `r.h` by default.
 */
export function paintRadarFx(ctx, fx, seconds, r, unit) {
  const ids = (fx && fx.ids) || []
  if (!ids.length || !(r.w >= 4) || !(r.h >= 4)) return
  const on = (id) => ids.indexOf(id) >= 0
  const I = clamp(Number(fx.intensity) || 0, 0, 1)
  // Frame timestamps can predate the caller's start time by a frame; never run backwards.
  const t = Math.max(0, Number(seconds) || 0) * clamp(Number(fx.speed) || 1, 0.25, 3)
  const u = unit > 0 ? unit : r.h / 100
  let base = hexRgb(fx.color)
  if (on('hue')) base = rotateHue(base, (t * 45) % 360)
  const light = mix(base, WHITE, 0.6)
  const corner = 1.2 * u
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const flick = on('flicker') ? flickerAmount(t, I) : 0
  const glitch = on('glitch') && glitchActive(t)
  const seed = Math.floor(t * 24)

  // ── Inside the radar ────────────────────────────────────────────────────────
  ctx.save()
  rrect(ctx, r.x, r.y, r.w, r.h, corner)
  ctx.clip()

  if (on('hue')) {
    ctx.fillStyle = rgba(base, 0.06 + 0.12 * I)
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }

  if (on('pulse')) {
    const k = wave(t, 2) ** 2
    ctx.fillStyle = rgba(base, (0.04 + 0.14 * I) * k)
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }

  if (on('heartbeat')) {
    const k = beat(t, 1.3)
    ctx.fillStyle = rgba(base, k * (0.05 + 0.15 * I))
    ctx.fillRect(r.x, r.y, r.w, r.h)
    // Monitor trace written left to right along the bottom, fading behind the head.
    const sweep = 2.6
    const head = ((t / sweep) % 1) * r.w
    if (head > 2) {
      const baseY = r.y + r.h * 0.84
      const amp = r.h * 0.11
      const step = Math.max(1, r.w / 180)
      ctx.save()
      ctx.beginPath()
      for (let x = 0; x <= head; x += step) {
        const tx = t - ((head - x) / r.w) * sweep
        const y = baseY - ecg((((tx / 1.3) % 1) + 1) % 1) * amp
        if (x === 0) ctx.moveTo(r.x, y)
        else ctx.lineTo(r.x + x, y)
      }
      const fade = ctx.createLinearGradient(r.x, 0, r.x + head, 0)
      fade.addColorStop(0, rgba(light, 0))
      fade.addColorStop(1, rgba(light, 0.2 + 0.75 * I))
      ctx.strokeStyle = fade
      ctx.lineJoin = 'round'
      ctx.lineWidth = Math.max(1, 0.8 * u)
      ctx.shadowColor = rgba(base, 0.9)
      ctx.shadowBlur = 4 * u
      ctx.stroke()
      ctx.restore()
    }
  }

  if (on('vignette')) {
    const k = wave(t, 3.2)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(r.w / r.h, 1)
    const g = ctx.createRadialGradient(0, 0, r.h * 0.18, 0, 0, r.h * 0.75)
    g.addColorStop(0, 'rgba(0,0,0,0)')
    g.addColorStop(0.62, rgba(BLACK, (0.12 + 0.18 * I) * (0.85 + 0.15 * k)))
    g.addColorStop(1, rgba(BLACK, (0.45 + 0.4 * I) * (0.85 + 0.15 * k)))
    ctx.fillStyle = g
    ctx.fillRect(-r.h, -r.h, r.h * 2, r.h * 2)
    ctx.restore()
  }

  if (on('scanlines')) {
    const gap = Math.max(2, Math.round(1.1 * u))
    const off = (t * 8) % gap
    ctx.fillStyle = rgba(BLACK, 0.14 + 0.22 * I)
    for (let y = r.y - gap + off; y < r.y + r.h; y += gap) ctx.fillRect(r.x, y, r.w, Math.max(1, gap * 0.45))
    // CRT refresh band rolling down.
    const p = (t / 3.4) % 1
    const by = r.y + (p * 1.3 - 0.15) * r.h
    const bh = 12 * u
    const band = ctx.createLinearGradient(0, by - bh, 0, by + bh)
    band.addColorStop(0, 'rgba(255,255,255,0)')
    band.addColorStop(0.5, rgba(light, 0.08 + 0.12 * I))
    band.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = band
    ctx.fillRect(r.x, by - bh, r.w, bh * 2)
  }

  if (on('radar')) {
    const period = 3.2
    const R = Math.hypot(r.w, r.h) / 2
    const a = (t / period) * TAU - Math.PI / 2
    ctx.strokeStyle = rgba(base, 0.1 + 0.12 * I)
    ctx.lineWidth = Math.max(1, 0.5 * u)
    for (const k of [0.22, 0.44, 0.66]) {
      ctx.beginPath()
      ctx.arc(cx, cy, r.h * k * 1.1, 0, TAU)
      ctx.stroke()
    }
    // Fading trail behind the beam: a conic gradient where the browser has one,
    // otherwise nested wedges that all end at the beam (no seams on big maps).
    const trail = 1.3
    const peak = 0.06 + 0.36 * I
    if (typeof ctx.createConicGradient === 'function') {
      const g = ctx.createConicGradient(a - trail, cx, cy)
      const f = trail / TAU
      for (const k of [0, 0.25, 0.5, 0.75, 1]) g.addColorStop(f * k, rgba(base, peak * k * k))
      g.addColorStop(Math.min(1, f + 0.0005), rgba(base, 0))
      g.addColorStop(1, rgba(base, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, TAU)
      ctx.fill()
    } else {
      const steps = Math.round(clamp(R / 12, 24, 90))
      // Each wedge adds the difference between neighbouring levels of the k² falloff.
      for (let i = steps; i > 0; i--) {
        const k = i / steps
        const step = peak * (k * k - ((i - 1) / steps) ** 2)
        ctx.fillStyle = rgba(base, step / Math.max(0.001, 1 - peak * ((i - 1) / steps) ** 2))
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.arc(cx, cy, R, a - (1 - (i - 1) / steps) * trail, a)
        ctx.closePath()
        ctx.fill()
      }
    }
    ctx.save()
    ctx.shadowColor = rgba(base, 0.95)
    ctx.shadowBlur = 6 * u
    ctx.strokeStyle = rgba(light, 0.55 + 0.45 * I)
    ctx.lineWidth = Math.max(1, 0.8 * u)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    ctx.stroke()
    ctx.restore()
    // Contacts light up as the beam passes them, then fade out.
    for (let n = 0; n < 6; n++) {
      const ang = hash(n + 1) * TAU
      const dist = (0.18 + 0.62 * hash(n + 11)) * r.h * 0.62
      const since = ((((a - ang) % TAU) + TAU) % TAU) / TAU
      const k = Math.max(0, 1 - since / 0.75)
      if (k <= 0) continue
      const px = cx + Math.cos(ang) * dist * (r.w / r.h)
      const py = cy + Math.sin(ang) * dist
      ctx.fillStyle = rgba(light, k * (0.35 + 0.65 * I))
      ctx.beginPath()
      ctx.arc(px, py, 1.4 * u, 0, TAU)
      ctx.fill()
      ctx.strokeStyle = rgba(base, k * 0.6 * I)
      ctx.lineWidth = Math.max(1, 0.5 * u)
      ctx.beginPath()
      ctx.arc(px, py, (1.6 + 3.5 * (1 - k)) * u, 0, TAU)
      ctx.stroke()
    }
  }

  if (on('ripple')) {
    const maxR = Math.hypot(r.w, r.h) * 0.55
    for (let n = 0; n < 3; n++) {
      const p = (t / 2.6 + n / 3) % 1
      const e = 1 - (1 - p) ** 2
      const a = (1 - p) ** 1.6 * (0.25 + 0.65 * I)
      ctx.save()
      ctx.shadowColor = rgba(base, a)
      ctx.shadowBlur = 5 * u
      ctx.strokeStyle = rgba(base, a)
      ctx.lineWidth = Math.max(1, (1.8 - 1.2 * p) * u)
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(0, (0.03 + 0.97 * e) * maxR), 0, TAU)
      ctx.stroke()
      ctx.restore()
    }
  }

  if (on('shimmer')) {
    const sheen = ctx.createLinearGradient(0, r.y, 0, r.y + r.h * 0.5)
    sheen.addColorStop(0, rgba(WHITE, 0.05 + 0.06 * I))
    sheen.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = sheen
    ctx.fillRect(r.x, r.y, r.w, r.h * 0.5)
    const p = (t / 3.6) % 1
    if (p < 0.55) {
      const x = r.x - r.w * 0.5 + (p / 0.55) * r.w * 2
      const bw = r.w * 0.2
      ctx.save()
      ctx.translate(x, cy)
      ctx.rotate(-0.35)
      const g = ctx.createLinearGradient(-bw, 0, bw, 0)
      g.addColorStop(0, 'rgba(255,255,255,0)')
      g.addColorStop(0.42, rgba(light, 0.08 + 0.12 * I))
      g.addColorStop(0.5, rgba(WHITE, 0.16 + 0.22 * I))
      g.addColorStop(0.58, rgba(light, 0.08 + 0.12 * I))
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(-bw, -r.h * 1.5, bw * 2, r.h * 3)
      ctx.restore()
    }
  }

  if (glitch) {
    const n = 4 + Math.floor(hash(seed) * 4)
    for (let i = 0; i < n; i++) {
      const y = r.y + hash(seed + i * 3.1) * r.h
      const hh = (1 + hash(seed + i * 5.3) * 5) * u
      const dx = (hash(seed + i * 7.7) - 0.5) * 14 * u * I
      ctx.fillStyle = i % 2 ? rgba([255, 40, 100], 0.2 + 0.35 * I) : rgba([0, 230, 255], 0.2 + 0.35 * I)
      ctx.fillRect(r.x + dx, y, r.w, hh)
    }
    for (let i = 0; i < 10; i++) {
      const s = (1.5 + hash(seed + i * 2.2) * 5) * u
      ctx.fillStyle = rgba(light, 0.1 + 0.15 * I)
      ctx.fillRect(r.x + hash(seed + i * 9.9) * r.w, r.y + hash(seed + i * 4.4) * r.h, s * 2.5, s * 0.5)
    }
  }

  if (flick > 0) {
    ctx.fillStyle = rgba(BLACK, 0.6 * flick)
    ctx.fillRect(r.x, r.y, r.w, r.h)
  }
  ctx.restore()

  // ── Around the radar ───────────────────────────────────────────────────────
  ctx.save()
  if (glitch) ctx.translate((hash(seed + 0.3) - 0.5) * 4 * u * I, 0)
  ctx.globalAlpha = 1 - 0.8 * flick
  ctx.lineJoin = 'round'
  const frame = (grow) => rrect(ctx, r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, corner + grow * 0.5)

  if (on('breathe')) {
    const k = wave(t, 3.4)
    ctx.save()
    ctx.shadowColor = rgba(base, 0.85)
    ctx.shadowBlur = 8 * u
    ctx.strokeStyle = rgba(base, (0.2 + 0.55 * I) * (1 - 0.55 * k))
    ctx.lineWidth = (1 + 1.6 * k) * u
    frame((1.5 + 5 * k) * u)
    ctx.stroke()
    ctx.restore()
  }

  if (on('glow')) {
    const k = 0.8 + 0.2 * wave(t, 2.8)
    ctx.save()
    ctx.shadowColor = rgba(base, 0.95)
    ctx.shadowBlur = (8 + 14 * I) * u * k
    ctx.strokeStyle = rgba(base, (0.55 + 0.45 * I) * k)
    ctx.lineWidth = 1.8 * u
    frame(u)
    ctx.stroke()
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.strokeStyle = rgba(light, 0.9)
    ctx.lineWidth = Math.max(1, 0.6 * u)
    frame(u)
    ctx.stroke()
    ctx.restore()
  }

  if (on('pulse')) {
    const k = wave(t, 2) ** 2
    ctx.save()
    ctx.shadowColor = rgba(base, 0.9)
    ctx.shadowBlur = 10 * u * k
    ctx.strokeStyle = rgba(base, (0.2 + 0.7 * I) * k)
    ctx.lineWidth = 1.4 * u
    frame(u)
    ctx.stroke()
    ctx.restore()
  }

  if (on('heartbeat')) {
    const k = beat(t, 1.3)
    ctx.save()
    ctx.shadowColor = rgba(base, 0.95)
    ctx.shadowBlur = 16 * u * k
    ctx.strokeStyle = rgba(base, (0.15 + 0.85 * k) * (0.4 + 0.6 * I))
    ctx.lineWidth = (1 + 2.5 * k) * u
    frame(u)
    ctx.stroke()
    ctx.restore()
  }

  if (glitch) {
    ctx.lineWidth = Math.max(1, 0.8 * u)
    ctx.strokeStyle = rgba([255, 40, 100], 0.6 * I)
    ctx.save()
    ctx.translate(-1.5 * u, 0)
    frame(u)
    ctx.stroke()
    ctx.restore()
    ctx.strokeStyle = rgba([0, 230, 255], 0.6 * I)
    ctx.save()
    ctx.translate(1.5 * u, 0)
    frame(u)
    ctx.stroke()
    ctx.restore()
  }
  ctx.restore()
}
