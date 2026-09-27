import { useEffect } from 'react'
import type { MapDocument, MapElement } from '@/types'
import type { StyledBase } from '@/lib/mapStyle'
import { absolutePoints, polygonCentroid, worldToCanvas } from '@/lib/geometry'
import { renderRegion } from '@/lib/render'
import { RADAR_VIEW_WORLD } from '@/lib/radarScene'
import { setRadarSource } from '@/lib/radarSource'

/** Legion Square, downtown Los Santos: where the preview "player" stands on an empty map. */
const DEFAULT_SPOT = { x: 195, y: -935 }
const SIZE = 512

function elementCenter(el: MapElement) {
  if (el.type === 'zone' || el.type === 'line') return polygonCentroid(absolutePoints(el))
  if (el.type === 'image') return { x: el.x + el.width / 2, y: el.y + el.height / 2 }
  return { x: el.x, y: el.y }
}

/** The preview follows the selection, else the first zone or marker, else downtown. */
function previewCenter(doc: MapDocument, selectedIds: string[]) {
  const pick =
    doc.elements.find((e) => selectedIds.includes(e.id)) ??
    doc.elements.find((e) => e.type === 'zone') ??
    doc.elements.find((e) => e.type === 'marker') ??
    doc.elements[0]
  return pick ? elementCenter(pick) : worldToCanvas(DEFAULT_SPOT.x, DEFAULT_SPOT.y, doc)
}

/**
 * Renders the map around the preview player (debounced) and publishes it for the
 * radar overlay previews. Idle while no overlay effect is selected.
 */
export function useRadarPreviewSource(doc: MapDocument | null, styled: StyledBase | null, selectedIds: string[], active: boolean) {
  useEffect(() => {
    if (!active || !doc) return
    const w = doc.world
    if (!(w.maxX > w.minX) || !(w.maxY > w.minY)) return
    let alive = true
    const timer = window.setTimeout(async () => {
      const center = previewCenter(doc, selectedIds)
      const sx = doc.baseMap.width / (w.maxX - w.minX)
      const sy = doc.baseMap.height / (w.maxY - w.minY)
      // Wide enough that the turning radar never shows the corners.
      const span = RADAR_VIEW_WORLD * 1.8
      const region = { x: center.x - (span * sx) / 2, y: center.y - (span * sy) / 2, width: span * sx, height: span * sy }
      try {
        const image = await renderRegion(doc, styled, region, SIZE, SIZE)
        if (alive) setRadarSource({ image, size: SIZE, worldSpan: span })
      } catch {
        /* keep the previous picture */
      }
    }, 250)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [doc, styled, selectedIds, active])
}
