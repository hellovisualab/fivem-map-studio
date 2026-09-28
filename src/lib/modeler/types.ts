/*
 * Modeler document. Coordinates are Z up and in metres, like Blender and GTA V, so the
 * numbers a user types match what they see in game. Faces are polygons (quads, n-gons)
 * listed counter-clockwise when seen from their front side.
 */

export type Vec3 = [number, number, number]
export type Vec2 = [number, number]

export interface Face {
  /** Vertex indices, counter-clockwise from the front. */
  v: number[]
  /** Per-corner UVs (same length as `v`). */
  uv: Vec2[]
  /** Material slot of the owning object. */
  mat: number
  smooth: boolean
}

export interface EditMesh {
  verts: Vec3[]
  faces: Face[]
}

export type ModifierKind = 'mirror' | 'array' | 'subsurf' | 'solidify'

export interface MirrorModifier {
  id: string
  kind: 'mirror'
  enabled: boolean
  axes: [boolean, boolean, boolean]
  /** Welds vertices closer than this to the mirror plane. */
  mergeDistance: number
}

export interface ArrayModifier {
  id: string
  kind: 'array'
  enabled: boolean
  count: number
  /** Offset in object-size units (relative) per copy. */
  relative: Vec3
  /** Extra offset in metres per copy. */
  constant: Vec3
}

export interface SubsurfModifier {
  id: string
  kind: 'subsurf'
  enabled: boolean
  levels: number
}

export interface SolidifyModifier {
  id: string
  kind: 'solidify'
  enabled: boolean
  thickness: number
}

export type Modifier = MirrorModifier | ArrayModifier | SubsurfModifier | SolidifyModifier

export interface ModelMaterial {
  id: string
  name: string
  color: string
  /** Image data URL used as the diffuse texture. */
  texture?: string
  /**
   * `box`: UVs are projected from the geometry at `uvScale` repeats per metre, so textures
   * keep their size whatever you model. `mesh`: the faces' own UVs (primitives, imports).
   */
  uvMode: 'box' | 'mesh'
  uvScale: number
  metalness: number
  roughness: number
  /** 0 = none. Makes the material glow (emissive shader in game). */
  emissive: number
  opacity: number
  doubleSided: boolean
}

export type ObjectRole = 'visual' | 'collision'

export interface ModelObject {
  id: string
  name: string
  mesh: EditMesh
  position: Vec3
  /** Euler XYZ, radians. */
  rotation: Vec3
  scale: Vec3
  /** Material ids by slot. */
  materials: string[]
  modifiers: Modifier[]
  visible: boolean
  role: ObjectRole
  /** Smooth normals between smooth faces up to this angle (degrees). */
  autoSmooth: number
}

export interface ModelDoc {
  objects: ModelObject[]
  materials: ModelMaterial[]
  /** 3D cursor: where new objects are added. */
  cursor: Vec3
}

export type SelectMode = 'vert' | 'edge' | 'face'

export interface MeshSelection {
  verts: Set<number>
  /** Edge keys `a:b` with a < b. */
  edges: Set<string>
  faces: Set<number>
}
