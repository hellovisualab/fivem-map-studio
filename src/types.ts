export type ToolId =
  | 'select'
  | 'move'
  | 'text'
  | 'image'
  | 'zone'
  | 'line'
  | 'polygon'
  | 'marker'
  | 'color'

export type ZoneType = 'gang' | 'police' | 'safe' | 'custom'

export type MarkerIcon = 'police' | 'hospital' | 'bank' | 'shop' | 'garage' | 'custom'

export type FontFamily =
  | 'Inter'
  | 'Arial'
  | 'Impact'
  | 'Georgia'
  | 'Courier New'
  | 'Verdana'
  | 'Trebuchet MS'
  | 'Times New Roman'

export interface BaseElement {
  id: string
  name: string
  visible: boolean
  locked: boolean
  x: number
  y: number
  rotation: number
  opacity: number
}

export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: FontFamily
  fill: string
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic'
  stroke?: string
  strokeWidth?: number
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  width: number
  height: number
}

export interface ZoneElement extends BaseElement {
  type: 'zone'
  zoneType: ZoneType
  /** Flat polygon point list relative to x/y: [x0, y0, x1, y1, ...] */
  points: number[]
  fill: string
  fillOpacity: number
  stroke: string
  strokeWidth: number
  description: string
  showLabel: boolean
}

export interface LineElement extends BaseElement {
  type: 'line'
  points: number[]
  stroke: string
  strokeWidth: number
  dash: boolean
  arrow: boolean
}

export interface MarkerElement extends BaseElement {
  type: 'marker'
  icon: MarkerIcon
  color: string
  size: number
  label: string
  customSrc?: string
  blipSprite: number
}

export type MapElement = TextElement | ImageElement | ZoneElement | LineElement | MarkerElement

export type ElementType = MapElement['type']

export type BaseMapPreset = 'color' | 'original' | 'satellite' | 'realmap' | 'custom'

export interface BaseMap {
  preset: BaseMapPreset
  /** Data URL or remote URL. Empty when the preset is procedurally generated on load. */
  src: string
  width: number
  height: number
  tint: string
  tintOpacity: number
  brightness: number
}

export interface WorldBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface MapDocument {
  version: 1
  baseMap: BaseMap
  elements: MapElement[]
  world: WorldBounds
  grid: {
    enabled: boolean
    size: number
  }
  background: string
}

export type PlanId = 'free' | 'supporter'

export interface Project {
  id: string
  ownerId: string
  name: string
  createdAt: string
  updatedAt: string
  thumbnail?: string
  document: MapDocument
}

export interface ProjectSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  thumbnail?: string
  preset: BaseMapPreset
  elementCount: number
  sizeBytes: number
}

export interface HistoryEntry {
  id: string
  projectId: string
  projectName: string
  action: 'created' | 'exported' | 'imported' | 'renamed' | 'deleted' | 'duplicated'
  at: string
  detail?: string
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  plan: PlanId
  createdAt: string
  exportsToday: number
  lastExportDate: string
  storageUsed: number
}
