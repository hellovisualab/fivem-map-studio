export type CollisionKind = 'none' | 'mesh' | 'box' | 'sphere' | 'capsule' | 'convex'
export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type RefKind = 'none' | 'player' | 'sofa' | 'car'

export interface PropMaterialInfo {
  uuid: string
  name: string
  color: string
  metalness: number
  roughness: number
  hasMap: boolean
  previewUrl?: string
}

export interface PropAsset {
  id: string
  name: string
  label: string
  file: File
  object: import('three').Object3D
  sidecarUrls: string[]
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  collision: CollisionKind
  /** 0.05–1: fraction of visual triangles kept for mesh collision. */
  collisionRatio: number
  lodDist: number
  hdTextureDist: number
  generateLods: boolean
  dynamic: boolean
  vertexCount: number
  triangleCount: number
  size: [number, number, number]
  localMin: [number, number, number]
  localMax: [number, number, number]
  materials: PropMaterialInfo[]
  warnings: string[]
}

export const COLLISION_QUALITY: { id: string; label: string; ratio: number }[] = [
  { id: 'full', label: 'Full', ratio: 1 },
  { id: 'high', label: 'High', ratio: 0.5 },
  { id: 'med', label: 'Med', ratio: 0.25 },
  { id: 'low', label: 'Low', ratio: 0.12 },
  { id: 'ultra', label: 'Ultra', ratio: 0.06 },
]

export const COLLISION_OPTIONS: { id: CollisionKind; label: string; hint: string }[] = [
  { id: 'mesh', label: 'Mesh', hint: 'Follows the model, can be optimized' },
  { id: 'box', label: 'Box', hint: 'Fast, good for furniture' },
  { id: 'sphere', label: 'Sphere', hint: 'Balls, pots, rocks' },
  { id: 'capsule', label: 'Capsule', hint: 'Poles, bottles' },
  { id: 'convex', label: 'Convex', hint: 'Outer hull of the model' },
  { id: 'none', label: 'None', hint: 'Visual only' },
]
