export type CollisionKind = 'none' | 'mesh' | 'box' | 'sphere' | 'capsule' | 'convex' | 'custom'
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
  /** Set for props made in the modeler: the editable source of `object`. */
  model?: import('@/lib/modeler/types').ModelDoc
  /** GTA surface of the collision (bound material index); unset = concrete / plastic (dynamic). */
  surface?: number
  /** Largest texture side in the .ydr (power of two). */
  textureSize?: number
}

/** Common GTA V collision materials (index in materials.dat, as Sollumz / CodeWalker list them). */
export const SURFACES: { id: number; label: string }[] = [
  { id: 1, label: 'Concrete' },
  { id: 4, label: 'Tarmac' },
  { id: 11, label: 'Stone' },
  { id: 13, label: 'Brick' },
  { id: 14, label: 'Marble' },
  { id: 9, label: 'Rock' },
  { id: 31, label: 'Gravel' },
  { id: 18, label: 'Sand' },
  { id: 35, label: 'Dirt' },
  { id: 47, label: 'Grass' },
  { id: 56, label: 'Metal (solid)' },
  { id: 59, label: 'Metal (hollow)' },
  { id: 65, label: 'Metal railing' },
  { id: 62, label: 'Chain-link fence' },
  { id: 70, label: 'Wood (solid)' },
  { id: 75, label: 'Wood (hollow)' },
  { id: 72, label: 'Wood (polished)' },
  { id: 86, label: 'Plastic' },
  { id: 87, label: 'Plastic (hollow)' },
  { id: 88, label: 'Plastic (dense)' },
  { id: 93, label: 'Rubber' },
  { id: 114, label: 'Glass' },
  { id: 113, label: 'Glass (bulletproof)' },
  { id: 81, label: 'Ceramic' },
  { id: 101, label: 'Plaster' },
  { id: 97, label: 'Carpet' },
  { id: 100, label: 'Cloth' },
  { id: 109, label: 'Leather' },
  { id: 104, label: 'Cardboard' },
  { id: 106, label: 'Foam' },
  { id: 54, label: 'Tree bark' },
  { id: 52, label: 'Leaves' },
  { id: 116, label: 'Car metal' },
]

export const SURFACE_CONCRETE = 1
export const SURFACE_PLASTIC = 86

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

/** Collision drawn in the modeler (objects marked as Collision). */
export const CUSTOM_COLLISION = { id: 'custom' as const, label: 'Modeled', hint: 'Collision objects from the modeler' }
