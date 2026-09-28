import { PRIMITIVES } from '@/lib/modeler/primitives'
import {
  addCollisionBox,
  addPrimitive,
  applyTransforms,
  clearTransform,
  cubeProjectSelection,
  cursorToOrigin,
  cursorToSelected,
  deleteElements,
  deleteObjects,
  dropToGround,
  fill,
  flipSelection,
  growSelection,
  hideSelected,
  joinSelected,
  mergeVerts,
  recalcSelection,
  revealAll,
  selectAllToggle,
  selectLinkedAll,
  selectionToCursor,
  separateSelection,
  setOriginSelected,
  shadeObjects,
  shadeSelection,
  smoothSelection,
  subdivideSelection,
  toggleEditMode,
  triangulateSelection,
  trisToQuadsSelection,
} from '@/lib/modeler/ops'
import { toast } from '@/components/ui/Toast'
import { useModeler } from '@/store/useModeler'
import { viewport } from '@/components/modeler/bridge'
import type { MenuItem } from '@/components/modeler/PopupMenu'

const vp = () => viewport.current

export function addMenu(): MenuItem[] {
  return [
    ...PRIMITIVES.map((p, i) => ({ label: p.label, hint: p.hint, divider: i === 5 || i === 8, onSelect: () => addPrimitive(p.kind) })),
    { label: 'Collision box', hint: 'fits the active object', divider: true, onSelect: () => addCollisionBox() },
  ]
}

export function deleteMenu(): MenuItem[] {
  const s = useModeler.getState()
  if (s.mode === 'object') return [{ label: 'Delete objects', hint: 'X', onSelect: deleteObjects }]
  return [
    { label: 'Vertices', onSelect: () => deleteElements('verts') },
    { label: 'Edges', onSelect: () => deleteElements('edges') },
    { label: 'Faces', onSelect: () => deleteElements('faces') },
    { label: 'Only faces', onSelect: () => deleteElements('only-faces') },
    { label: 'Dissolve vertices', divider: true, onSelect: () => deleteElements('dissolve-verts') },
    { label: 'Dissolve edges', onSelect: () => deleteElements('dissolve-edges') },
    { label: 'Dissolve faces', onSelect: () => deleteElements('dissolve-faces') },
  ]
}

export function mergeMenu(): MenuItem[] {
  return [
    { label: 'At center', onSelect: () => mergeVerts('center') },
    { label: 'At 3D cursor', onSelect: () => mergeVerts('cursor') },
    {
      label: 'By distance',
      hint: '0.1 mm',
      onSelect: () => {
        const n = mergeVerts('distance')
        toast.info('Merge by distance', `Removed ${n} vertex${n === 1 ? '' : 'es'}`)
      },
    },
  ]
}

export function snapMenu(): MenuItem[] {
  return [
    { label: 'Cursor to selected', onSelect: cursorToSelected },
    { label: 'Cursor to world origin', onSelect: cursorToOrigin },
    { label: 'Selection to cursor', onSelect: selectionToCursor },
  ]
}

export function applyMenu(): MenuItem[] {
  return [
    { label: 'Location', onSelect: () => applyTransforms({ location: true }) },
    { label: 'Rotation', onSelect: () => applyTransforms({ rotation: true }) },
    { label: 'Scale', onSelect: () => applyTransforms({ scale: true }) },
    { label: 'All transforms', onSelect: () => applyTransforms({ location: true, rotation: true, scale: true }) },
  ]
}

export function originMenu(): MenuItem[] {
  return [
    { label: 'Origin to geometry', onSelect: () => setOriginSelected('geometry') },
    { label: 'Origin to bottom (ground)', onSelect: () => setOriginSelected('bottom') },
    { label: 'Origin to 3D cursor', onSelect: () => setOriginSelected('cursor') },
    { label: 'Origin to world origin', onSelect: () => setOriginSelected('world') },
  ]
}

export function objectMenu(): MenuItem[] {
  return [
    { label: 'Move', hint: 'G', onSelect: () => vp()?.startTransform('translate') },
    { label: 'Rotate', hint: 'R', onSelect: () => vp()?.startTransform('rotate') },
    { label: 'Scale', hint: 'S', onSelect: () => vp()?.startTransform('scale') },
    { label: 'Apply', hint: 'Ctrl A', divider: true, items: applyMenu() },
    { label: 'Set origin', items: originMenu() },
    {
      label: 'Clear',
      items: [
        { label: 'Location', hint: 'Alt G', onSelect: () => clearTransform('location') },
        { label: 'Rotation', hint: 'Alt R', onSelect: () => clearTransform('rotation') },
        { label: 'Scale', hint: 'Alt S', onSelect: () => clearTransform('scale') },
      ],
    },
    { label: 'Snap', hint: 'Shift S', items: snapMenu() },
    { label: 'Drop model to ground', onSelect: dropToGround },
    { label: 'Duplicate', hint: 'Shift D', divider: true, onSelect: () => vp()?.duplicateMove() },
    { label: 'Join', hint: 'Ctrl J', onSelect: joinSelected },
    { label: 'Shade smooth', divider: true, onSelect: () => shadeObjects(true) },
    { label: 'Shade flat', onSelect: () => shadeObjects(false) },
    { label: 'Hide selected', hint: 'H', divider: true, onSelect: () => hideSelected() },
    { label: 'Hide unselected', hint: 'Shift H', onSelect: () => hideSelected(true) },
    { label: 'Reveal hidden', hint: 'Alt H', onSelect: revealAll },
    { label: 'Delete', hint: 'X', divider: true, onSelect: deleteObjects },
  ]
}

export function meshMenu(): MenuItem[] {
  return [
    { label: 'Move', hint: 'G', onSelect: () => vp()?.startTransform('translate') },
    { label: 'Rotate', hint: 'R', onSelect: () => vp()?.startTransform('rotate') },
    { label: 'Scale', hint: 'S', onSelect: () => vp()?.startTransform('scale') },
    { label: 'Extrude', hint: 'E', divider: true, onSelect: () => vp()?.startExtrude() },
    { label: 'Inset faces', hint: 'I', onSelect: () => vp()?.startInset() },
    { label: 'Loop cut', hint: 'Ctrl R', onSelect: () => vp()?.startLoopCut() },
    { label: 'Subdivide', onSelect: subdivideSelection },
    { label: 'Duplicate', hint: 'Shift D', onSelect: () => vp()?.duplicateMove() },
    { label: 'Fill (make face)', hint: 'F', onSelect: () => fill() },
    { label: 'Merge', hint: 'M', divider: true, items: mergeMenu() },
    { label: 'Separate selection', hint: 'P', onSelect: separateSelection },
    { label: 'Smooth vertices', onSelect: smoothSelection },
    { label: 'Triangulate faces', hint: 'Ctrl T', onSelect: triangulateSelection },
    { label: 'Tris to quads', hint: 'Alt J', onSelect: trisToQuadsSelection },
    {
      label: 'Normals',
      divider: true,
      items: [
        { label: 'Recalculate outside', hint: 'Shift N', onSelect: () => recalcSelection(false) },
        { label: 'Recalculate inside', onSelect: () => recalcSelection(true) },
        { label: 'Flip', hint: 'Alt N', onSelect: flipSelection },
      ],
    },
    {
      label: 'Shading',
      items: [
        { label: 'Smooth faces', onSelect: () => shadeSelection(true) },
        { label: 'Flat faces', onSelect: () => shadeSelection(false) },
      ],
    },
    { label: 'UV: cube projection', onSelect: () => cubeProjectSelection(1) },
    { label: 'Snap', hint: 'Shift S', items: snapMenu() },
    { label: 'Delete', hint: 'X', divider: true, items: deleteMenu() },
  ]
}

export function selectMenu(): MenuItem[] {
  const edit = useModeler.getState().mode === 'edit'
  return [
    { label: 'All', hint: 'A', onSelect: () => selectAllToggle('select') },
    { label: 'None', hint: 'Alt A', onSelect: () => selectAllToggle('deselect') },
    { label: 'Invert', hint: 'Ctrl I', onSelect: () => selectAllToggle('invert') },
    ...(edit
      ? [
          { label: 'More', hint: 'Ctrl +', divider: true, onSelect: () => growSelection(true) },
          { label: 'Less', hint: 'Ctrl -', onSelect: () => growSelection(false) },
          { label: 'Linked', hint: 'Ctrl L', onSelect: selectLinkedAll },
        ]
      : []),
  ]
}

export function viewMenu(): MenuItem[] {
  const s = useModeler.getState()
  return [
    { label: 'Frame selected', hint: 'Numpad .', onSelect: () => vp()?.frameSelected() },
    { label: 'Frame all', hint: 'Home', onSelect: () => vp()?.frameAll() },
    { label: 'Front', hint: 'Numpad 1', divider: true, onSelect: () => vp()?.setView('front') },
    { label: 'Back', hint: 'Ctrl Numpad 1', onSelect: () => vp()?.setView('back') },
    { label: 'Right', hint: 'Numpad 3', onSelect: () => vp()?.setView('right') },
    { label: 'Left', hint: 'Ctrl Numpad 3', onSelect: () => vp()?.setView('left') },
    { label: 'Top', hint: 'Numpad 7', onSelect: () => vp()?.setView('top') },
    { label: 'Bottom', hint: 'Ctrl Numpad 7', onSelect: () => vp()?.setView('bottom') },
    { label: 'X-ray', hint: 'Alt Z', divider: true, checked: s.xray, onSelect: () => s.setXray(!s.xray) },
    { label: 'Player reference', checked: s.showReference, onSelect: () => s.setShowReference(!s.showReference) },
  ]
}

/** Right click menu of the viewport. */
export function contextMenu(): MenuItem[] {
  const s = useModeler.getState()
  if (s.mode === 'object') {
    return [
      { label: 'Edit mode', hint: 'Tab', onSelect: toggleEditMode },
      { label: 'Shade smooth', divider: true, onSelect: () => shadeObjects(true) },
      { label: 'Shade flat', onSelect: () => shadeObjects(false) },
      { label: 'Set origin', items: originMenu() },
      { label: 'Apply', items: applyMenu() },
      { label: 'Duplicate', hint: 'Shift D', divider: true, onSelect: () => vp()?.duplicateMove() },
      { label: 'Join', hint: 'Ctrl J', onSelect: joinSelected },
      { label: 'Snap', items: snapMenu() },
      { label: 'Delete', hint: 'X', divider: true, onSelect: deleteObjects },
    ]
  }
  return [
    { label: 'Extrude', hint: 'E', onSelect: () => vp()?.startExtrude() },
    { label: 'Inset faces', hint: 'I', onSelect: () => vp()?.startInset() },
    { label: 'Loop cut', hint: 'Ctrl R', onSelect: () => vp()?.startLoopCut() },
    { label: 'Subdivide', onSelect: subdivideSelection },
    { label: 'Fill', hint: 'F', onSelect: () => fill() },
    { label: 'Merge', hint: 'M', divider: true, items: mergeMenu() },
    { label: 'Smooth vertices', onSelect: smoothSelection },
    { label: 'Flip normals', hint: 'Alt N', onSelect: flipSelection },
    { label: 'Recalculate normals', hint: 'Shift N', onSelect: () => recalcSelection(false) },
    { label: 'Shade smooth', divider: true, onSelect: () => shadeSelection(true) },
    { label: 'Shade flat', onSelect: () => shadeSelection(false) },
    { label: 'Separate', hint: 'P', onSelect: separateSelection },
    { label: 'Delete', hint: 'X', divider: true, items: deleteMenu() },
    { label: 'Object mode', hint: 'Tab', divider: true, onSelect: toggleEditMode },
  ]
}
