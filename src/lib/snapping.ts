/** Smart-guide snapping for the canvas editor (all values in document pixels). */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/** A guide line to draw while snapped: vertical (x set) or horizontal (y set), spanning `from`–`to`. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

const xs = (r: Rect) => [r.x, r.x + r.width / 2, r.x + r.width]
const ys = (r: Rect) => [r.y, r.y + r.height / 2, r.y + r.height]

/**
 * Snaps a moving rectangle's edges and centre to the edges and centres of the
 * targets. Returns the offset to apply and the guides to show; an axis with
 * nothing within `threshold` gets a 0 offset and `snappedX/Y = false`.
 */
export function snapRect(moving: Rect, targets: Rect[], threshold: number) {
  let best = { dx: 0, dy: 0, ex: threshold + 1, ey: threshold + 1 }
  const mx = xs(moving)
  const my = ys(moving)
  for (const t of targets) {
    for (const tx of xs(t))
      for (const m of mx) {
        const d = tx - m
        if (Math.abs(d) < best.ex) best = { ...best, dx: d, ex: Math.abs(d) }
      }
    for (const ty of ys(t))
      for (const m of my) {
        const d = ty - m
        if (Math.abs(d) < best.ey) best = { ...best, dy: d, ey: Math.abs(d) }
      }
  }
  const snappedX = best.ex <= threshold
  const snappedY = best.ey <= threshold
  const dx = snappedX ? best.dx : 0
  const dy = snappedY ? best.dy : 0
  const moved = { ...moving, x: moving.x + dx, y: moving.y + dy }
  const guides: Guide[] = []
  const eps = 0.01
  if (snappedX) {
    // One guide per matching line, spanning the moved box and every target on it.
    for (const at of new Set(xs(moved).filter((x) => targets.some((t) => xs(t).some((tx) => Math.abs(tx - x) < eps))))) {
      const hits = targets.filter((t) => xs(t).some((tx) => Math.abs(tx - at) < eps))
      const all = [moved, ...hits]
      guides.push({ axis: 'x', at, from: Math.min(...all.map((r) => r.y)), to: Math.max(...all.map((r) => r.y + r.height)) })
    }
  }
  if (snappedY) {
    for (const at of new Set(ys(moved).filter((y) => targets.some((t) => ys(t).some((ty) => Math.abs(ty - y) < eps))))) {
      const hits = targets.filter((t) => ys(t).some((ty) => Math.abs(ty - at) < eps))
      const all = [moved, ...hits]
      guides.push({ axis: 'y', at, from: Math.min(...all.map((r) => r.x)), to: Math.max(...all.map((r) => r.x + r.width)) })
    }
  }
  return { dx, dy, snappedX, snappedY, guides }
}

function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len = vx * vx + vy * vy
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len)) : 0
  return { x: a.x + vx * t, y: a.y + vy * t }
}

/**
 * Snaps a dragged vertex to another shape's vertex first, then to the nearest
 * point on one of its edges, so neighbouring territories can share borders.
 */
export function snapPoint(p: Point, vertices: Point[], segments: [Point, Point][], threshold: number): { point: Point; kind: 'vertex' | 'edge' } | null {
  let best: Point | null = null
  let bestD = threshold
  for (const v of vertices) {
    const d = Math.hypot(v.x - p.x, v.y - p.y)
    if (d <= bestD) {
      best = v
      bestD = d
    }
  }
  if (best) return { point: best, kind: 'vertex' }
  bestD = threshold
  for (const [a, b] of segments) {
    const c = closestOnSegment(p, a, b)
    const d = Math.hypot(c.x - p.x, c.y - p.y)
    if (d <= bestD) {
      best = c
      bestD = d
    }
  }
  return best ? { point: best, kind: 'edge' } : null
}

export const snapToGrid = (v: number, size: number) => Math.round(v / size) * size
