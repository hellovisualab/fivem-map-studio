import type {
  BaseMapPreset,
  ImageElement,
  LineElement,
  MapDocument,
  MapElement,
  MarkerElement,
  MarkerIcon,
  TextElement,
  ZoneElement,
  ZoneType,
} from '@/types'
import { DEFAULT_WORLD, MARKER_ICONS, ZONE_TYPES } from './constants'
import { PRESET_SIZE } from './basemaps'
import { uid } from './utils'

const base = (name: string, x: number, y: number) => ({
  id: uid(),
  name,
  visible: true,
  locked: false,
  x,
  y,
  rotation: 0,
  opacity: 1,
})

export function createText(x: number, y: number, text = 'New label'): TextElement {
  return {
    ...base(text, x, y),
    type: 'text',
    text,
    fontSize: 42,
    fontFamily: 'Inter',
    fill: '#ffffff',
    fontStyle: 'bold',
    stroke: '#000000',
    strokeWidth: 0,
  }
}

export function createImage(x: number, y: number, src: string, width: number, height: number, name = 'Image'): ImageElement {
  return { ...base(name, x, y), type: 'image', src, width, height }
}

export function createZone(points: number[], zoneType: ZoneType = 'custom', name?: string): ZoneElement {
  // Normalize so that x/y is the top-left of the polygon and points are relative.
  let minX = Infinity
  let minY = Infinity
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i])
    minY = Math.min(minY, points[i + 1])
  }
  const rel = points.map((v, i) => (i % 2 === 0 ? v - minX : v - minY))
  const meta = ZONE_TYPES[zoneType]
  return {
    ...base(name ?? meta.label, minX, minY),
    type: 'zone',
    zoneType,
    points: rel,
    fill: meta.color,
    fillOpacity: 0.35,
    stroke: meta.color,
    strokeWidth: 3,
    description: '',
    showLabel: true,
  }
}

export function createRectZone(x0: number, y0: number, x1: number, y1: number, zoneType: ZoneType = 'custom') {
  return createZone([x0, y0, x1, y0, x1, y1, x0, y1], zoneType)
}

export function createLine(points: number[], name = 'Line'): LineElement {
  let minX = Infinity
  let minY = Infinity
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i])
    minY = Math.min(minY, points[i + 1])
  }
  const rel = points.map((v, i) => (i % 2 === 0 ? v - minX : v - minY))
  return {
    ...base(name, minX, minY),
    type: 'line',
    points: rel,
    stroke: '#ff8a1f',
    strokeWidth: 4,
    dash: false,
    arrow: false,
  }
}

export function createMarker(x: number, y: number, icon: MarkerIcon = 'custom'): MarkerElement {
  const meta = MARKER_ICONS[icon]
  return {
    ...base(meta.label, x, y),
    type: 'marker',
    icon,
    color: meta.color,
    size: 36,
    label: meta.label,
    blipSprite: meta.blip,
  }
}

/**
 * @param source For `custom` the uploaded image; for presets, an optional real
 *   texture resolved from /maps/ (empty src = procedural fallback).
 */
export function createDocument(preset: BaseMapPreset, source?: { src: string; width: number; height: number }): MapDocument {
  return {
    version: 1,
    baseMap: {
      preset,
      src: source?.src ?? '',
      width: source?.width ?? PRESET_SIZE.width,
      height: source?.height ?? PRESET_SIZE.height,
      tint: '#ff8a1f',
      tintOpacity: 0,
      brightness: 1,
    },
    elements: [],
    world: { ...DEFAULT_WORLD },
    grid: { enabled: false, size: 128 },
    background: '#0a0a0c',
  }
}

export function cloneElement(el: MapElement, dx = 24, dy = 24): MapElement {
  return { ...el, id: uid(), name: `${el.name} copy`, x: el.x + dx, y: el.y + dy }
}

export const ELEMENT_LABEL: Record<MapElement['type'], string> = {
  text: 'Text',
  image: 'Image',
  zone: 'Zone',
  line: 'Line',
  marker: 'Marker',
}
