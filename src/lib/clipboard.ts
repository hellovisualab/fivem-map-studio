import type { MapElement } from '@/types'
import { absolutePoints } from '@/lib/geometry'
import { uid } from '@/lib/utils'

/**
 * Element clipboard shared by every open project and tab (localStorage), with an
 * in-memory fallback when storage is unavailable.
 */
const KEY = 'labseve7:clipboard'

interface ClipboardData {
  elements: MapElement[]
  /** How many times this copy was pasted, so repeated pastes cascade. */
  pastes: number
}

let memory: ClipboardData | null = null

function read(): ClipboardData | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const data = JSON.parse(raw) as ClipboardData
      if (Array.isArray(data.elements)) return data
    }
  } catch {
    /* fall back to memory */
  }
  return memory
}

function write(data: ClipboardData) {
  memory = data
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* quota or private mode: memory copy still works in this tab */
  }
}

export function copyElements(elements: MapElement[]) {
  if (!elements.length) return
  write({ elements: structuredClone(elements), pastes: 0 })
}

export function hasClipboard() {
  return !!read()?.elements.length
}

/** Anchor-point bounds of a set of elements (document pixels). */
export function elementsBounds(elements: MapElement[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const el of elements) {
    const pts = el.type === 'image' ? [{ x: el.x, y: el.y }, { x: el.x + el.width, y: el.y + el.height }] : absolutePoints(el)
    for (const p of pts) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Fresh copies of the clipboard elements. Each paste cascades 24 px from the last;
 * when the copies would land outside `view`, they are centred in it instead.
 */
export function takePaste(view: { x: number; y: number; width: number; height: number }): MapElement[] {
  const data = read()
  if (!data?.elements.length) return []
  const b = elementsBounds(data.elements)
  const onScreen = b.x + b.width >= view.x && b.x <= view.x + view.width && b.y + b.height >= view.y && b.y <= view.y + view.height
  if (onScreen) {
    const step = 24 * (data.pastes + 1)
    write({ ...data, pastes: data.pastes + 1 })
    return fresh(data.elements, step, step)
  }
  // Somewhere else on the map (or another project): centre on the view, then cascade from there.
  const dx = view.x + view.width / 2 - (b.x + b.width / 2)
  const dy = view.y + view.height / 2 - (b.y + b.height / 2)
  const placed = fresh(data.elements, dx, dy)
  write({ elements: structuredClone(placed), pastes: 0 })
  return placed
}

function fresh(elements: MapElement[], dx: number, dy: number): MapElement[] {
  return elements.map((el) => ({ ...structuredClone(el), id: uid(), x: el.x + dx, y: el.y + dy, locked: false }))
}
