import type { WorldBounds } from '@/types'
import type { PresetStyle } from './basemaps'

/**
 * Cayo Perico, the island added by The Cayo Perico Heist (game build 2189). It lies
 * south-east of Los Santos, outside the vanilla 2×3 minimap_sea grid, so the game
 * draws it with its own island map instead of the minimap texture.
 */
export const CAYO_PERICO = {
  name: 'Cayo Perico',
  /** Island anchor used by the in-game loader to decide when the player is near. */
  center: { x: 4840.571, y: -5174.425, z: 2 },
  /** The resource streams the island within this distance of `center` (metres). */
  loadDistance: 2000,
  /** First game build that ships the island (`sv_enforceGameBuild`). */
  minGameBuild: 2189,
  /** Area the canvas reserves for the island: the island plus a sea margin, in GTA world units. */
  bounds: { minX: 3700, maxX: 5900, minY: -6250, maxY: -3950 } satisfies WorldBounds,
}

/** Whether a GTA world position falls inside the Cayo Perico area. */
export const isInCayo = (x: number, y: number) => {
  const b = CAYO_PERICO.bounds
  return x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY
}

type Pt = [number, number]

// Stylized geography in GTA world coordinates (x east, y north). The outline follows
// the island's landmarks (airstrip NW, north dock NE, main dock E, compound S) but is
// a design guide, not a survey: exported positions always come from the exact grid.
const COAST: Pt[] = [
  [4150, -4600], [4190, -4470], [4300, -4405], [4450, -4385], [4610, -4410], [4760, -4450],
  [4880, -4430], [4990, -4455], [5090, -4515], [5170, -4585], [5250, -4660], [5330, -4770],
  [5375, -4900], [5405, -5030], [5425, -5150], [5400, -5270], [5350, -5390], [5310, -5510],
  [5240, -5620], [5160, -5720], [5090, -5810], [5010, -5870], [4910, -5880], [4820, -5820],
  [4740, -5730], [4655, -5635], [4560, -5545], [4470, -5470], [4390, -5380], [4330, -5270],
  [4265, -5160], [4230, -5070], [4190, -4990], [4160, -4880], [4140, -4750],
]

/** Small islets around the main island: [x, y, radius]. */
const ISLETS: [number, number, number][] = [
  [5335, -4535, 55],
  [4520, -5770, 42],
  [4065, -5010, 30],
  [5480, -5390, 26],
]

/** Hills: [x, y, radius]. The compound sits on the southern one. */
const HILLS: [number, number, number][] = [
  [5060, -5560, 240],
  [5235, -5330, 175],
  [4520, -5290, 150],
  [4960, -4610, 110],
]

const RUNWAY: Pt[] = [
  [4265, -4478],
  [4745, -4545],
]

const ROADS: Pt[][] = [
  [[4745, -4545], [4800, -4700], [4840, -4900]],
  [[4840, -4900], [4980, -4760], [5120, -4640], [5205, -4575]],
  [[4840, -4900], [5020, -5000], [5200, -5080], [5335, -5135]],
  [[4840, -4900], [4870, -5150], [4930, -5400], [4990, -5600], [5012, -5660]],
  [[4840, -4900], [4640, -4960], [4420, -5000], [4250, -5025]],
  [[5012, -5660], [5150, -5500], [5250, -5300], [5335, -5135]],
  [[4930, -5400], [4760, -5500], [4620, -5580]],
]

/** Crop fields in the island's interior: [x, y, width, height]. */
const FIELDS: [number, number, number, number][] = [
  [4600, -5080, 150, 110],
  [4700, -5250, 120, 130],
  [5080, -4900, 140, 100],
]

function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** Closed Catmull-Rom curve through `pts` (already in canvas pixels). */
function smoothClosed(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  const n = pts.length
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1])
  }
  ctx.closePath()
}

function polyline(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
}

/** Maps GTA world coordinates to canvas pixels. */
export interface WorldToPixel {
  (x: number, y: number): Pt
}

/**
 * Draws the stylized Cayo Perico island with a preset's colors onto a canvas with a
 * transparent sea, so styles, glow and clipping treat it like the rest of the map.
 *
 * @param unit Canvas pixels per world unit, used for line widths and radii.
 */
export function drawCayoPerico(ctx: CanvasRenderingContext2D, toPx: WorldToPixel, unit: number, style: PresetStyle) {
  const px = (pts: Pt[]) => pts.map(([x, y]) => toPx(x, y))
  const coast = px(COAST)
  const islets = ISLETS.map(([x, y, r]) => [...toPx(x, y), r * unit] as const)
  const land = () => {
    smoothClosed(ctx, coast)
    for (const [x, y, r] of islets) {
      ctx.moveTo(x + r, y)
      ctx.arc(x, y, r, 0, Math.PI * 2)
    }
  }
  const rnd = seeded(4840)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Shallow-water halo, then the beach rim and the land itself.
  if (style.coastGlow) {
    ctx.save()
    ctx.shadowColor = style.coastGlow
    ctx.shadowBlur = Math.max(6, 70 * unit)
    ctx.fillStyle = style.coastGlow
    land()
    ctx.fill()
    ctx.restore()
  }
  ctx.strokeStyle = style.sand
  ctx.lineWidth = Math.max(2, 34 * unit)
  land()
  ctx.stroke()
  ctx.fillStyle = style.land
  land()
  ctx.fill()

  // Everything below stays inside the coastline.
  ctx.save()
  land()
  ctx.clip()

  const [x0, y0] = toPx(4100, -4350)
  const [x1, y1] = toPx(5500, -5900)
  for (let i = 0; i < 14; i++) {
    const x = x0 + rnd() * (x1 - x0)
    const y = y0 + rnd() * (y1 - y0)
    const r = (90 + rnd() * 160) * unit
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, style.landAlt)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  for (const [hx, hy, hr] of HILLS) {
    const [x, y] = toPx(hx, hy)
    const r = hr * unit
    const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r)
    g.addColorStop(0, style.mountain)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = style.cityBlock ?? style.landAlt
  ctx.globalAlpha = 0.55
  for (const [fx, fy, fw, fh] of FIELDS) {
    const [x, y] = toPx(fx, fy)
    ctx.fillRect(x, y, fw * unit, fh * unit)
  }
  ctx.globalAlpha = 1

  // Roads, casing first.
  for (const road of ROADS) {
    const pts = px(road)
    if (style.roadCasing) {
      ctx.strokeStyle = style.roadCasing
      ctx.lineWidth = Math.max(1.5, 16 * unit)
      polyline(ctx, pts)
      ctx.stroke()
    }
    ctx.strokeStyle = style.road
    ctx.lineWidth = Math.max(1, 9 * unit)
    polyline(ctx, pts)
    ctx.stroke()
  }

  // Airstrip: runway with a centre line and an apron.
  const runway = px(RUNWAY)
  const [ax, ay] = toPx(4560, -4560)
  ctx.fillStyle = style.cityBlock ?? style.roadCasing ?? style.highwayCasing
  ctx.fillRect(ax, ay, 150 * unit, 70 * unit)
  ctx.strokeStyle = style.highwayCasing
  ctx.lineWidth = Math.max(3, 52 * unit)
  polyline(ctx, runway)
  ctx.stroke()
  ctx.strokeStyle = style.highway
  ctx.lineWidth = Math.max(2, 40 * unit)
  polyline(ctx, runway)
  ctx.stroke()
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'
  ctx.lineWidth = Math.max(0.6, 3 * unit)
  ctx.setLineDash([22 * unit, 16 * unit])
  polyline(ctx, runway)
  ctx.stroke()
  ctx.restore()

  // El Rubio's compound: walled grounds with the main house.
  const [cx, cy] = toPx(4920, -5670)
  ctx.fillStyle = style.cityBlock ?? style.landAlt
  ctx.fillRect(cx, cy, 190 * unit, 160 * unit)
  ctx.strokeStyle = style.highwayCasing
  ctx.lineWidth = Math.max(1, 7 * unit)
  ctx.strokeRect(cx, cy, 190 * unit, 160 * unit)
  ctx.fillStyle = style.road
  ctx.fillRect(cx + 60 * unit, cy + 50 * unit, 80 * unit, 55 * unit)
  ctx.restore()

  // Docks reach out over the water, so draw them after lifting the clip.
  const dock = (from: Pt, to: Pt, width: number) => {
    ctx.strokeStyle = style.highwayCasing
    ctx.lineWidth = Math.max(2, (width + 8) * unit)
    polyline(ctx, px([from, to]))
    ctx.stroke()
    ctx.strokeStyle = style.road
    ctx.lineWidth = Math.max(1.5, width * unit)
    polyline(ctx, px([from, to]))
    ctx.stroke()
  }
  dock([5330, -5120], [5520, -5120], 46)
  dock([5360, -5190], [5500, -5215], 30)
  dock([5195, -4580], [5265, -4470], 28)
  ctx.restore()
}

const previews = new Map<string, string>()

/** Small picture of the island in a preset's colors, for pickers. Cached per palette. */
export function cayoPreview(style: PresetStyle, height = 128): string {
  const key = `${JSON.stringify(style)}|${height}`
  const hit = previews.get(key)
  if (hit) return hit
  const view = { minX: 4020, maxX: 5620, minY: -6000, maxY: -4300 }
  const unit = height / (view.maxY - view.minY)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round((view.maxX - view.minX) * unit)
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = style.sea
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  drawCayoPerico(ctx, (x, y) => [(x - view.minX) * unit, (view.maxY - y) * unit], unit, style)
  const url = canvas.toDataURL('image/png')
  previews.set(key, url)
  return url
}
