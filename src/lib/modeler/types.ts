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

export type ModifierKind =
  | 'mirror'
  | 'array'
  | 'radial'
  | 'subsurf'
  | 'solidify'
  | 'bevel'
  | 'boolean'
  | 'decimate'
  | 'triangulate'
  | 'weld'
  | 'wireframe'
  | 'smooth'
  | 'displace'
  | 'deform'
  | 'cast'

interface ModifierBase {
  id: string
  enabled: boolean
}

export interface MirrorModifier extends ModifierBase {
  kind: 'mirror'
  axes: [boolean, boolean, boolean]
  /** Welds vertices closer than this to the mirror plane. */
  mergeDistance: number
}

export interface ArrayModifier extends ModifierBase {
  kind: 'array'
  count: number
  /** Offset in object-size units (relative) per copy. */
  relative: Vec3
  /** Extra offset in metres per copy. */
  constant: Vec3
}

/** Copies rotated around an axis through the object origin (wheels, fences around a pole). */
export interface RadialArrayModifier extends ModifierBase {
  kind: 'radial'
  count: number
  /** Total angle in degrees (360 = full circle). */
  angle: number
  axis: 0 | 1 | 2
}

export interface SubsurfModifier extends ModifierBase {
  kind: 'subsurf'
  levels: number
}

export interface SolidifyModifier extends ModifierBase {
  kind: 'solidify'
  thickness: number
}

/** Chamfers the edges sharper than `angle` degrees. */
export interface BevelModifier extends ModifierBase {
  kind: 'bevel'
  width: number
  angle: number
}

export type BooleanOperation = 'difference' | 'union' | 'intersect'

export interface BooleanModifier extends ModifierBase {
  kind: 'boolean'
  operation: BooleanOperation
  /** Object used as the cutter / second operand. */
  target: string | null
}

export interface DecimateModifier extends ModifierBase {
  kind: 'decimate'
  /** collapse: keep `ratio` of the vertices; planar: merge faces flatter than `angle`. */
  mode: 'collapse' | 'planar'
  ratio: number
  angle: number
}

export interface TriangulateModifier extends ModifierBase {
  kind: 'triangulate'
}

export interface WeldModifier extends ModifierBase {
  kind: 'weld'
  distance: number
}

export interface WireframeModifier extends ModifierBase {
  kind: 'wireframe'
  thickness: number
}

export interface SmoothModifier extends ModifierBase {
  kind: 'smooth'
  factor: number
  repeat: number
}

export interface DisplaceModifier extends ModifierBase {
  kind: 'displace'
  strength: number
  /** Noise feature size in metres. */
  size: number
  seed: number
}

export type DeformMode = 'twist' | 'bend' | 'taper' | 'stretch'

export interface DeformModifier extends ModifierBase {
  kind: 'deform'
  mode: DeformMode
  /** Degrees for twist / bend, factor for taper / stretch. */
  factor: number
  axis: 0 | 1 | 2
}

export interface CastModifier extends ModifierBase {
  kind: 'cast'
  shape: 'sphere' | 'cylinder'
  factor: number
}

export type Modifier =
  | MirrorModifier
  | ArrayModifier
  | RadialArrayModifier
  | SubsurfModifier
  | SolidifyModifier
  | BevelModifier
  | BooleanModifier
  | DecimateModifier
  | TriangulateModifier
  | WeldModifier
  | WireframeModifier
  | SmoothModifier
  | DisplaceModifier
  | DeformModifier
  | CastModifier

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

/** visual: rendered in game; collision: invisible collision; helper: modelling aid (boolean cutters), not exported. */
export type ObjectRole = 'visual' | 'collision' | 'helper'

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
