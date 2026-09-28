import * as THREE from 'three'
import { objectMatrix } from '@/lib/modeler/build'
import type { ModelObject, Vec3 } from '@/lib/modeler/types'

/*
 * Glue between the modeler viewport (inside the three.js canvas) and the DOM around it:
 * header menus and toolbar buttons call into the viewport through `viewport`.
 */

/** Document (Z up) -> three.js world (Y up). */
export const ROOT_MATRIX = new THREE.Matrix4().makeRotationX(-Math.PI / 2)
export const ROOT_INVERSE = ROOT_MATRIX.clone().invert()

export const docToWorld = (p: Vec3, out = new THREE.Vector3()) => out.set(p[0], p[2], -p[1])
export const worldToDoc = (v: THREE.Vector3): Vec3 => [v.x, -v.z + 0, v.y]

export function objectWorldMatrix(obj: Pick<ModelObject, 'position' | 'rotation' | 'scale'>) {
  return new THREE.Matrix4().multiplyMatrices(ROOT_MATRIX, objectMatrix(obj))
}

export { modelMaterials } from '@/lib/modeler/build'

export type ViewName = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom'

export interface ViewportApi {
  startTransform: (kind: 'translate' | 'rotate' | 'scale') => void
  startExtrude: () => void
  startInset: () => void
  startLoopCut: () => void
  duplicateMove: () => void
  setView: (view: ViewName) => void
  orbitBy: (dx: number, dy: number) => void
  panBy: (dx: number, dy: number) => void
  zoomBy: (factor: number) => void
  frameSelected: () => void
  frameAll: () => void
  /** Opens a viewport menu at a screen point (default: the last pointer position). */
  openMenu: (menu: 'add' | 'delete' | 'merge' | 'context' | 'snap' | 'apply', at?: { clientX: number; clientY: number }) => void
  /** Ends the running G / R / S, extrude, inset or loop cut (touch buttons). */
  confirmModal: () => void
  cancelModal: () => void
  /** Camera rotation, read every frame by the navigation gizmo. */
  cameraQuaternion: THREE.Quaternion
}

export const viewport: { current: ViewportApi | null } = { current: null }
