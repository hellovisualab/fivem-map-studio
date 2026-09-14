import type { MapDocument, MapElement, WorldBounds } from '@/types'
import { round } from './utils'

/** Convert a canvas pixel position into GTA V world coordinates. */
export function canvasToWorld(px: number, py: number, doc: MapDocument) {
  const { width, height } = doc.baseMap
  const w: WorldBounds = doc.world
  const x = w.minX + (px / width) * (w.maxX - w.minX)
  // GTA's Y axis points north (up), canvas Y points down.
  const y = w.maxY - (py / height) * (w.maxY - w.minY)
  return { x: round(x, 2), y: round(y, 2) }
}

export function worldToCanvas(wx: number, wy: number, doc: MapDocument) {
  const { width, height } = doc.baseMap
  const w = doc.world
  const px = ((wx - w.minX) / (w.maxX - w.minX)) * width
  const py = ((w.maxY - wy) / (w.maxY - w.minY)) * height
  return { x: px, y: py }
}

export function rotatePoint(x: number, y: number, deg: number) {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: x * c - y * s, y: x * s + y * c }
}

/** Absolute polygon points (in canvas pixels) for a zone/line element. */
export function absolutePoints(el: MapElement): { x: number; y: number }[] {
  if (el.type !== 'zone' && el.type !== 'line') return [{ x: el.x, y: el.y }]
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < el.points.length; i += 2) {
    const p = rotatePoint(el.points[i], el.points[i + 1], el.rotation)
    out.push({ x: el.x + p.x, y: el.y + p.y })
  }
  return out
}

export function polygonCentroid(points: { x: number; y: number }[]) {
  if (!points.length) return { x: 0, y: 0 }
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  return { x: sx / points.length, y: sy / points.length }
}

export function boundsOfPoints(points: number[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i])
    maxX = Math.max(maxX, points[i])
    minY = Math.min(minY, points[i + 1])
    maxY = Math.max(maxY, points[i + 1])
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}
