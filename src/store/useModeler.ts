import { create } from 'zustand'
import { emptySelection } from '@/lib/modeler/mesh'
import { newDoc } from '@/lib/modeler/doc'
import type { MeshSelection, ModelDoc, ModelObject, SelectMode } from '@/lib/modeler/types'

export type ModelerMode = 'object' | 'edit'
export type ModelerTool = 'select' | 'cursor' | 'move' | 'rotate' | 'scale' | 'loopcut'
export type Shading = 'solid' | 'material' | 'wireframe'

/** Everything undo / redo restores. */
export interface ModelerSnapshot {
  doc: ModelDoc
  mode: ModelerMode
  selectMode: SelectMode
  /** Selected object ids; the active one is `active`. */
  selected: string[]
  active: string | null
  /** Edit mode selection of the active object. */
  meshSel: MeshSelection
}

interface ModelerState extends ModelerSnapshot {
  past: ModelerSnapshot[]
  future: ModelerSnapshot[]
  /** State before an interactive operation (modal transform, gizmo drag). */
  txn: ModelerSnapshot | null
  /** Bumped on every document change, so the prop can be rebuilt. */
  revision: number
  tool: ModelerTool
  xray: boolean
  shading: Shading
  snap: boolean
  showReference: boolean
  /** Properties sidebar shown (N), on screens wide enough for it. */
  sidebar: boolean
  /** Status bar text of the running operation. */
  status: string | null

  load: (doc: ModelDoc) => void
  /** Applies `next` as one undo step. */
  commit: (next: Partial<ModelerSnapshot>) => void
  /** Changes state without an undo step (selection clicks use commit too, like Blender). */
  patch: (next: Partial<ModelerSnapshot>) => void
  begin: () => void
  live: (next: Partial<ModelerSnapshot>) => void
  end: (keep: boolean) => void
  undo: () => void
  redo: () => void
  setTool: (tool: ModelerTool) => void
  setXray: (on: boolean) => void
  setShading: (s: Shading) => void
  setSnap: (on: boolean) => void
  setShowReference: (on: boolean) => void
  setSidebar: (on: boolean) => void
  setStatus: (s: string | null) => void
}

const HISTORY = 80

const snapshot = (s: ModelerSnapshot): ModelerSnapshot => ({
  doc: s.doc,
  mode: s.mode,
  selectMode: s.selectMode,
  selected: s.selected,
  active: s.active,
  meshSel: s.meshSel,
})

function initial(doc: ModelDoc): ModelerSnapshot {
  const first = doc.objects[0]?.id ?? null
  return { doc, mode: 'object', selectMode: 'vert', selected: first ? [first] : [], active: first, meshSel: emptySelection() }
}

export const useModeler = create<ModelerState>((set, get) => ({
  ...initial(newDoc()),
  past: [],
  future: [],
  txn: null,
  revision: 0,
  tool: 'select',
  xray: false,
  shading: 'material',
  snap: false,
  showReference: true,
  sidebar: true,
  status: null,

  load: (doc) => set((s) => ({ ...initial(doc), past: [], future: [], txn: null, revision: s.revision + 1, status: null })),
  commit: (next) =>
    set((s) => ({
      past: [...s.past.slice(-(HISTORY - 1)), snapshot(s.txn ?? s)],
      future: [],
      txn: null,
      ...next,
      revision: next.doc && next.doc !== s.doc ? s.revision + 1 : s.revision,
    })),
  patch: (next) => set((s) => ({ ...next, revision: next.doc && next.doc !== s.doc ? s.revision + 1 : s.revision })),
  begin: () => set((s) => ({ txn: snapshot(s) })),
  live: (next) => set((s) => ({ ...next, revision: next.doc && next.doc !== s.doc ? s.revision + 1 : s.revision })),
  end: (keep) => {
    const { txn } = get()
    if (!txn) return
    if (keep) set((s) => ({ past: [...s.past.slice(-(HISTORY - 1)), txn], future: [], txn: null }))
    else set((s) => ({ ...txn, txn: null, revision: s.revision + 1 }))
  },
  undo: () =>
    set((s) => {
      if (s.txn || !s.past.length) return {}
      const prev = s.past[s.past.length - 1]
      return { ...prev, past: s.past.slice(0, -1), future: [snapshot(s), ...s.future].slice(0, HISTORY), revision: s.revision + 1 }
    }),
  redo: () =>
    set((s) => {
      if (s.txn || !s.future.length) return {}
      const next = s.future[0]
      return { ...next, future: s.future.slice(1), past: [...s.past, snapshot(s)].slice(-HISTORY), revision: s.revision + 1 }
    }),
  setTool: (tool) => set({ tool }),
  setXray: (xray) => set({ xray }),
  setShading: (shading) => set({ shading }),
  setSnap: (snap) => set({ snap }),
  setShowReference: (showReference) => set({ showReference }),
  setSidebar: (sidebar) => set({ sidebar }),
  setStatus: (status) => set({ status }),
}))

export function activeObject(s: Pick<ModelerSnapshot, 'doc' | 'active'>): ModelObject | null {
  return s.doc.objects.find((o) => o.id === s.active) ?? null
}

/** Replaces one object of the document. */
export function withObject(doc: ModelDoc, id: string, fn: (o: ModelObject) => ModelObject): ModelDoc {
  return { ...doc, objects: doc.objects.map((o) => (o.id === id ? fn(o) : o)) }
}
