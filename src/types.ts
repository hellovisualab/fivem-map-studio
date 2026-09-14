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
  | 'Bebas Neue'
  | 'Anton'
  | 'Oswald'
  | 'Teko'
  | 'Russo One'
  | 'Black Ops One'
  | 'Bangers'
  | 'Righteous'
  | 'Permanent Marker'
  | 'Pacifico'
  | 'Great Vibes'
  | 'Cinzel'

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

/** Photoshop-like layer effects available on every element. */
export interface ElementEffects {
  blend: BlendMode
  /** Drop shadow / outer glow. */
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowOpacity: number
  /** Masks the element to the base-map silhouette (non-transparent pixels). */
  clipToMap: boolean
}

export interface BaseElement {
  id: string
  name: string
  visible: boolean
  locked: boolean
  x: number
  y: number
  rotation: number
  opacity: number
  effects?: Partial<ElementEffects>
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
  letterSpacing?: number
  uppercase?: boolean
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

export type BaseMapPreset = 'color' | 'original' | 'satellite' | 'realmap' | 'realmapdown' | 'custom'

export type MapPresetId = Exclude<BaseMapPreset, 'custom'>

export interface GradientOverlay {
  enabled: boolean
  from: string
  to: string
  /** Degrees, 0 = top → bottom. */
  angle: number
  opacity: number
  blend: BlendMode
}

export interface MapGlow {
  enabled: boolean
  color: string
  /** Blur radius in map pixels, relative to a 2048px-tall map (scaled with the texture). */
  size: number
  /** 1–3 passes; more = denser aura. */
  strength: number
  opacity: number
}

/** Color grading + overlays applied to the base-map texture. */
export interface BaseMapStyle {
  brightness: number
  contrast: number
  saturation: number
  /** Hue rotation in degrees. */
  hue: number
  grayscale: number
  invert: boolean
  tint: string
  tintOpacity: number
  tintBlend: BlendMode
  gradient: GradientOverlay
  glow: MapGlow
  /** Color key that turns the sea transparent on opaque textures (null = use the texture alpha). */
  keyColor: string | null
  /** 0–1 similarity tolerance for the color key. */
  keyTolerance: number
}

export interface BaseMap extends Partial<BaseMapStyle> {
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
  /** Sea / canvas color, or the literal 'transparent' for alpha exports. */
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
