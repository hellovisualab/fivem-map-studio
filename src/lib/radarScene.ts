import { bigmapRect, minimapRect, pauseMapRect, surfaceUnit, type RadarRect, type RadarSurface } from './overlayRuntime'

/**
 * Editor-only mock-up of the game HUD used to preview the radar overlay: the
 * radar sits where client.lua places the exported overlay on a 1080p screen.
 */

/** Virtual screen the HUD preview is laid out on, with a typical safe zone. */
export const PREVIEW_SCREEN = { width: 1920, height: 1080, safeZone: 0.94 }

/** World units the preview radar shows across its width (on foot, default zoom). */
export const RADAR_VIEW_WORLD = 800
/** World units across the expanded radar, which zooms out further. */
export const BIGMAP_VIEW_WORLD = 2400
/** World units across the screen on the pause menu map when it opens. */
export const PAUSE_VIEW_WORLD = 4200
/** World units covered by the shared map picture; enough for every preview. */
export const PREVIEW_SOURCE_SPAN = 4800

/** Map picture around the player for the preview radar: square, north up. */
export interface RadarSource {
  image: CanvasImageSource
  /** Pixel size of `image`. */
  size: number
  /** World units covered by the side of `image`. */
  worldSpan: number
}

/** Gentle camera sway, so the preview radar turns like it does while playing. */
export const previewHeading = (t: number) => ((16 * Math.sin(t / 7) + 6 * Math.sin(t / 2.7)) * Math.PI) / 180

let generic: RadarSource | null = null

/** Stand-in city blocks used before the project's own map is ready. */
export function genericRadarSource(): RadarSource {
  if (generic) return generic
  const size = 256
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#4b5647'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#2f4b5e'
  ctx.beginPath()
  ctx.ellipse(size * 0.92, size * 0.1, size * 0.42, size * 0.3, 0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#434d40'
  for (let y = 8; y < size; y += 28) for (let x = (y / 28) % 2 ? 4 : 18; x < size; x += 34) ctx.fillRect(x, y, 22, 16)
  ctx.strokeStyle = '#8f978b'
  ctx.lineWidth = 3
  for (let v = 0; v < size; v += 34) {
    ctx.beginPath()
    ctx.moveTo(v, 0)
    ctx.lineTo(v + 18, size)
    ctx.stroke()
  }
  for (let v = 0; v < size; v += 28) {
    ctx.beginPath()
    ctx.moveTo(0, v)
    ctx.lineTo(size, v - 10)
    ctx.stroke()
  }
  ctx.strokeStyle = '#c9a45a'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(-10, size * 0.8)
  ctx.quadraticCurveTo(size * 0.5, size * 0.55, size + 10, size * 0.62)
  ctx.stroke()
  generic = { image: c, size, worldSpan: RADAR_VIEW_WORLD * 1.8 }
  return generic
}

/**
 * Draws the radar the way the game does: the map turned with the camera, the
 * player arrow in the middle, the north blip on the edge and the health / armour
 * bars underneath.
 *
 * @param viewWorld World units across the radar (the expanded radar shows more).
 * @param blipRef Height of the normal radar in canvas pixels: blips and bars keep that
 *   size when the radar expands.
 */
export function drawRadar(
  ctx: CanvasRenderingContext2D,
  r: RadarRect,
  source: RadarSource,
  heading: number,
  viewWorld = RADAR_VIEW_WORLD,
  blipRef = r.h,
) {
  if (r.w < 8 || r.h < 8) return
  const bar = Math.max(2, blipRef * 0.04)
  const gap = Math.max(1, blipRef * 0.02)
  const mapH = r.h - bar - gap
  const cx = r.x + r.w / 2
  const cy = r.y + mapH / 2

  ctx.save()
  ctx.beginPath()
  ctx.rect(r.x, r.y, r.w, mapH)
  ctx.clip()
  ctx.fillStyle = '#1d2b36'
  ctx.fillRect(r.x, r.y, r.w, mapH)
  const side = (source.worldSpan * r.w) / viewWorld
  ctx.translate(cx, cy)
  ctx.rotate(-heading)
  ctx.globalAlpha = 0.94
  ctx.drawImage(source.image, -side / 2, -side / 2, side, side)
  ctx.restore()

  // Player arrow: the radar turns with the camera, so it points up.
  const blip = blipRef - bar - gap
  const s = blip * 0.075
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.lineTo(s * 0.7, s * 0.78)
  ctx.lineTo(0, s * 0.38)
  ctx.lineTo(-s * 0.7, s * 0.78)
  ctx.closePath()
  ctx.fillStyle = '#f4f4f4'
  ctx.fill()
  ctx.lineWidth = Math.max(1, s * 0.14)
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'
  ctx.stroke()
  ctx.restore()

  // North blip where the map's north meets the radar edge.
  const dx = -Math.sin(heading)
  const dy = -Math.cos(heading)
  const inset = blip * 0.1
  const k = Math.min((r.w / 2 - inset) / Math.max(1e-6, Math.abs(dx)), (mapH / 2 - inset) / Math.max(1e-6, Math.abs(dy)))
  const nr = blip * 0.065
  ctx.save()
  ctx.translate(cx + dx * k, cy + dy * k)
  ctx.beginPath()
  ctx.arc(0, 0, nr, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(16,16,16,0.85)'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.max(6, nr * 1.25)}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('N', 0, nr * 0.06)
  ctx.restore()

  // Health (green) and armour (blue).
  const by = r.y + mapH + gap
  const half = (r.w - gap) / 2
  const meter = (x: number, track: string, fill: string, level: number) => {
    ctx.fillStyle = track
    ctx.fillRect(x, by, half, bar)
    ctx.fillStyle = fill
    ctx.fillRect(x, by, half * level, bar)
  }
  meter(r.x, 'rgba(33,58,33,0.9)', '#57a64f', 0.86)
  meter(r.x + half + gap, 'rgba(26,52,70,0.9)', '#4aa3dc', 0.55)
}

export interface HudLayout {
  /** The map surface the effects play on, in canvas pixels. */
  rect: RadarRect
  /** Pixels per effect unit (undefined: 1% of the rect height). */
  unit: number | undefined
  /** The whole virtual screen, in canvas pixels. */
  screen: RadarRect
}

/**
 * Lays a surface out on a `w × h` canvas: the bottom-left corner of the HUD for the
 * radar and the expanded radar, the whole screen for the pause map.
 */
export function hudLayout(w: number, h: number, surface: RadarSurface = 'radar'): HudLayout {
  const S = PREVIEW_SCREEN
  let rect: RadarRect
  let view: RadarRect
  if (surface === 'pause') {
    rect = pauseMapRect(S.width, S.height, S.safeZone)
    view = { x: 0, y: 0, w: S.width, h: S.height }
  } else if (surface === 'bigmap') {
    rect = bigmapRect(S.width, S.height, S.safeZone)
    const top = rect.y - rect.h * 0.16
    view = { x: 0, y: top, w: (S.height - top) * 1.375, h: S.height - top }
  } else {
    rect = minimapRect(S.width, S.height, S.safeZone)
    const top = rect.y - rect.h * 0.7
    view = { x: 0, y: top, w: rect.x + rect.w + rect.h * 0.85, h: S.height - top }
  }
  const k = Math.min(w / view.w, h / view.h)
  const ox = surface === 'pause' ? (w - view.w * k) / 2 : 0
  const oy = surface === 'pause' ? (h - view.h * k) / 2 : h - view.h * k
  const map = (r: RadarRect) => ({ x: ox + (r.x - view.x) * k, y: oy + (r.y - view.y) * k, w: r.w * k, h: r.h * k })
  return {
    rect: map(rect),
    unit: surface === 'radar' ? undefined : surfaceUnit(surface, S.height) * k,
    screen: map({ x: 0, y: 0, w: S.width, h: S.height }),
  }
}

/**
 * The pause menu with its map tab open: the map north up around the player, the
 * header with the tabs and the instructional buttons.
 */
export function drawPauseScreen(ctx: CanvasRenderingContext2D, screen: RadarRect, source: RadarSource) {
  const { x, y, w, h } = screen
  if (w < 16 || h < 9) return
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.fillStyle = '#1d2b36'
  ctx.fillRect(x, y, w, h)
  const side = (source.worldSpan * w) / PAUSE_VIEW_WORLD
  ctx.drawImage(source.image, x + w / 2 - side / 2, y + h / 2 - side / 2, side, side)
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  ctx.fillRect(x, y, w, h)

  // Player blip at the centre, facing north-east.
  const s = h * 0.022
  ctx.save()
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(0.6)
  ctx.beginPath()
  ctx.moveTo(0, -s)
  ctx.lineTo(s * 0.7, s * 0.78)
  ctx.lineTo(0, s * 0.38)
  ctx.lineTo(-s * 0.7, s * 0.78)
  ctx.closePath()
  ctx.fillStyle = '#f4f4f4'
  ctx.fill()
  ctx.lineWidth = Math.max(1, s * 0.14)
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'
  ctx.stroke()
  ctx.restore()

  // Header: tabs over a dark band, the map tab selected.
  const band = ctx.createLinearGradient(0, y, 0, y + h * 0.16)
  band.addColorStop(0, 'rgba(0,0,0,0.85)')
  band.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = band
  ctx.fillRect(x, y, w, h * 0.16)
  const font = Math.max(5, h * 0.024)
  ctx.font = `600 ${font}px Arial, sans-serif`
  ctx.textBaseline = 'middle'
  let tx = x + w * 0.1
  const ty = y + h * 0.07
  for (const [i, tab] of ['MAP', 'BRIEF', 'STATS', 'SETTINGS', 'GALLERY'].entries()) {
    const tw = ctx.measureText(tab).width
    ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255,255,255,0.55)'
    ctx.fillText(tab, tx, ty)
    if (i === 0) ctx.fillRect(tx, ty + font * 0.75, tw, Math.max(1, font * 0.14))
    tx += tw + font * 1.6
  }

  // Instructional buttons, bottom right.
  const small = Math.max(4, h * 0.017)
  ctx.font = `${small}px Arial, sans-serif`
  let bx = x + w * 0.93
  const by = y + h * 0.93
  for (const label of ['Back', 'Waypoint', 'Zoom']) {
    const bw = ctx.measureText(label).width + small * 2.2
    bx -= bw
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.fillRect(bx, by - small, bw - small * 0.4, small * 2)
    ctx.fillStyle = '#e8e8e8'
    ctx.fillText(label, bx + small * 0.9, by)
    bx -= small * 0.4
  }
  ctx.restore()
}

/** A radar centred in a `w × h` canvas with room around it for glows (effect tiles). */
export function tileRadarRect(w: number, h: number): RadarRect {
  const S = PREVIEW_SCREEN
  const radar = minimapRect(S.width, S.height, 1)
  const ratio = radar.w / radar.h
  const bleed = 0.18
  const rh = Math.min(h / (1 + bleed * 2), w / (ratio + bleed * 2))
  const rw = rh * ratio
  return { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh }
}

const backdrops = new Map<string, HTMLCanvasElement>()

/** Out-of-focus game scene behind the HUD. */
export function drawHudBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const key = `${w}x${h}`
  let c = backdrops.get(key)
  if (!c) {
    c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')!
    const sky = g.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#3a4a5e')
    sky.addColorStop(0.55, '#1f2733')
    sky.addColorStop(1, '#0d1117')
    g.fillStyle = sky
    g.fillRect(0, 0, w, h)
    let seed = 7
    const rnd = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w
      const y = h * (0.15 + rnd() * 0.55)
      const r = (0.02 + rnd() * 0.08) * w
      const warm = rnd() > 0.45
      const blob = g.createRadialGradient(x, y, 0, x, y, r)
      blob.addColorStop(0, warm ? 'rgba(255,190,120,0.16)' : 'rgba(120,180,255,0.12)')
      blob.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = blob
      g.fillRect(x - r, y - r, r * 2, r * 2)
    }
    const floor = g.createLinearGradient(0, h * 0.6, 0, h)
    floor.addColorStop(0, 'rgba(0,0,0,0)')
    floor.addColorStop(1, 'rgba(0,0,0,0.45)')
    g.fillStyle = floor
    g.fillRect(0, 0, w, h)
    if (backdrops.size > 8) backdrops.clear()
    backdrops.set(key, c)
  }
  ctx.drawImage(c, 0, 0)
}
