import { create } from 'zustand'
import type { MapDocument, MapElement, Project, ToolId, ZoneType, MarkerIcon } from '@/types'
import { getData } from '@/lib/data'
import { cloneElement, migrateDocument } from '@/lib/elements'
import { debounce } from '@/lib/utils'

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error' | 'idle'

export interface Viewport {
  scale: number
  x: number
  y: number
}

interface EditorState {
  project: Project | null
  doc: MapDocument | null
  past: MapDocument[]
  future: MapDocument[]
  transaction: MapDocument | null
  selectedIds: string[]
  tool: ToolId
  viewport: Viewport
  pointer: { x: number; y: number } | null
  saveState: SaveState
  lastSavedAt: string | null
  /** Defaults used by the drawing tools */
  zoneType: ZoneType
  markerIcon: MarkerIcon
  paintColor: string
  panels: { layers: boolean; properties: boolean; toolbar: boolean }
  thumbnailProvider: (() => Promise<string | undefined>) | null

  loadProject: (project: Project) => void
  unload: () => void
  setTool: (tool: ToolId) => void
  setZoneType: (z: ZoneType) => void
  setMarkerIcon: (m: MarkerIcon) => void
  setPaintColor: (c: string) => void
  setViewport: (v: Partial<Viewport>) => void
  setPointer: (p: { x: number; y: number } | null) => void
  togglePanel: (p: keyof EditorState['panels']) => void
  setThumbnailProvider: (fn: (() => Promise<string | undefined>) | null) => void

  select: (ids: string[], additive?: boolean) => void
  clearSelection: () => void

  commit: (mutate: (doc: MapDocument) => MapDocument | void, opts?: { silent?: boolean }) => void
  beginTransaction: () => void
  endTransaction: () => void
  updateElement: (id: string, patch: Partial<MapElement>, live?: boolean) => void
  updateElements: (ids: string[], patch: Partial<MapElement>) => void
  addElement: (el: MapElement, selectIt?: boolean) => void
  deleteElements: (ids: string[]) => void
  deleteSelected: () => void
  duplicateSelected: () => void
  reorderElement: (id: string, toIndex: number) => void
  moveLayer: (id: string, dir: 'up' | 'down' | 'top' | 'bottom') => void
  toggleVisible: (id: string) => void
  toggleLocked: (id: string) => void
  updateDocument: (patch: Partial<MapDocument>) => void
  renameProject: (name: string) => void

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  save: () => Promise<void>
  scheduleSave: () => void
}

const MAX_HISTORY = 80

const applyMutation = (doc: MapDocument, mutate: (d: MapDocument) => MapDocument | void): MapDocument => {
  const draft: MapDocument = structuredClone(doc)
  const result = mutate(draft)
  return result ?? draft
}

export const useEditor = create<EditorState>((set, get) => {
  const debouncedSave = debounce(() => {
    void get().save()
  }, 900)

  return {
    project: null,
    doc: null,
    past: [],
    future: [],
    transaction: null,
    selectedIds: [],
    tool: 'select',
    viewport: { scale: 0.35, x: 0, y: 0 },
    pointer: null,
    saveState: 'idle',
    lastSavedAt: null,
    zoneType: 'gang',
    markerIcon: 'police',
    paintColor: '#ff8a1f',
    panels: { layers: true, properties: true, toolbar: true },
    thumbnailProvider: null,

    loadProject: (project) => {
      debouncedSave.cancel()
      set({
        project,
        doc: migrateDocument(project.document),
        past: [],
        future: [],
        transaction: null,
        selectedIds: [],
        tool: 'select',
        saveState: 'saved',
        lastSavedAt: project.updatedAt,
      })
    },

    unload: () => {
      debouncedSave.cancel()
      set({ project: null, doc: null, past: [], future: [], selectedIds: [], saveState: 'idle' })
    },

    setTool: (tool) => set({ tool }),
    setZoneType: (zoneType) => set({ zoneType }),
    setMarkerIcon: (markerIcon) => set({ markerIcon }),
    setPaintColor: (paintColor) => set({ paintColor }),
    setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
    setPointer: (pointer) => set({ pointer }),
    togglePanel: (p) => set((s) => ({ panels: { ...s.panels, [p]: !s.panels[p] } })),
    setThumbnailProvider: (fn) => set({ thumbnailProvider: fn }),

    select: (ids, additive = false) =>
      set((s) => {
        if (!additive) return { selectedIds: ids }
        const next = new Set(s.selectedIds)
        for (const id of ids) {
          if (next.has(id)) next.delete(id)
          else next.add(id)
        }
        return { selectedIds: [...next] }
      }),
    clearSelection: () => set({ selectedIds: [] }),

    commit: (mutate, opts) => {
      const { doc, past } = get()
      if (!doc) return
      const next = applyMutation(doc, mutate)
      set({
        doc: next,
        past: opts?.silent ? past : [...past.slice(-MAX_HISTORY + 1), doc],
        future: opts?.silent ? get().future : [],
        saveState: 'unsaved',
      })
      get().scheduleSave()
    },

    beginTransaction: () => {
      const { doc, transaction } = get()
      if (doc && !transaction) set({ transaction: structuredClone(doc) })
    },

    endTransaction: () => {
      const { transaction, past, doc } = get()
      if (!transaction || !doc) return
      const changed = JSON.stringify(transaction.elements) !== JSON.stringify(doc.elements)
      set({
        transaction: null,
        past: changed ? [...past.slice(-MAX_HISTORY + 1), transaction] : past,
        future: changed ? [] : get().future,
        saveState: changed ? 'unsaved' : get().saveState,
      })
      if (changed) get().scheduleSave()
    },

    updateElement: (id, patch, live = false) => {
      if (live) {
        // Live updates (dragging) mutate the doc without touching history; the
        // surrounding transaction captures the pre-drag snapshot.
        set((s) => {
          if (!s.doc) return {}
          return {
            doc: {
              ...s.doc,
              elements: s.doc.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as MapElement) : e)),
            },
          }
        })
        return
      }
      get().commit((d) => {
        d.elements = d.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as MapElement) : e))
      })
    },

    updateElements: (ids, patch) => {
      const set_ = new Set(ids)
      get().commit((d) => {
        d.elements = d.elements.map((e) => (set_.has(e.id) ? ({ ...e, ...patch } as MapElement) : e))
      })
    },

    addElement: (el, selectIt = true) => {
      get().commit((d) => {
        d.elements.push(el)
      })
      if (selectIt) set({ selectedIds: [el.id] })
    },

    deleteElements: (ids) => {
      const s = new Set(ids)
      get().commit((d) => {
        d.elements = d.elements.filter((e) => !s.has(e.id) || e.locked)
      })
      set((st) => ({ selectedIds: st.selectedIds.filter((id) => !s.has(id)) }))
    },

    deleteSelected: () => {
      const { selectedIds } = get()
      if (selectedIds.length) get().deleteElements(selectedIds)
    },

    duplicateSelected: () => {
      const { selectedIds, doc } = get()
      if (!doc || !selectedIds.length) return
      const clones = doc.elements.filter((e) => selectedIds.includes(e.id)).map((e) => cloneElement(e))
      get().commit((d) => {
        d.elements.push(...clones)
      })
      set({ selectedIds: clones.map((c) => c.id) })
    },

    reorderElement: (id, toIndex) => {
      get().commit((d) => {
        const from = d.elements.findIndex((e) => e.id === id)
        if (from < 0) return
        const [el] = d.elements.splice(from, 1)
        d.elements.splice(Math.max(0, Math.min(d.elements.length, toIndex)), 0, el)
      })
    },

    moveLayer: (id, dir) => {
      const { doc } = get()
      if (!doc) return
      const idx = doc.elements.findIndex((e) => e.id === id)
      if (idx < 0) return
      const last = doc.elements.length - 1
      const to = dir === 'up' ? Math.min(last, idx + 1) : dir === 'down' ? Math.max(0, idx - 1) : dir === 'top' ? last : 0
      if (to !== idx) get().reorderElement(id, to)
    },

    toggleVisible: (id) => {
      get().commit((d) => {
        d.elements = d.elements.map((e) => (e.id === id ? { ...e, visible: !e.visible } : e))
      })
    },

    toggleLocked: (id) => {
      get().commit((d) => {
        d.elements = d.elements.map((e) => (e.id === id ? { ...e, locked: !e.locked } : e))
      })
    },

    updateDocument: (patch) => {
      get().commit((d) => ({ ...d, ...patch }))
    },

    renameProject: (name) => {
      const { project } = get()
      if (!project) return
      set({ project: { ...project, name }, saveState: 'unsaved' })
      get().scheduleSave()
    },

    undo: () => {
      const { past, doc, future } = get()
      if (!doc || !past.length) return
      const prev = past[past.length - 1]
      set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future].slice(0, MAX_HISTORY), saveState: 'unsaved' })
      set((s) => ({ selectedIds: s.selectedIds.filter((id) => prev.elements.some((e) => e.id === id)) }))
      get().scheduleSave()
    },

    redo: () => {
      const { past, doc, future } = get()
      if (!doc || !future.length) return
      const [next, ...rest] = future
      set({ doc: next, past: [...past, doc], future: rest, saveState: 'unsaved' })
      get().scheduleSave()
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    scheduleSave: () => {
      debouncedSave()
    },

    save: async () => {
      const { project, doc, thumbnailProvider } = get()
      if (!project || !doc) return
      debouncedSave.cancel()
      set({ saveState: 'saving' })
      let thumbnail = project.thumbnail
      try {
        thumbnail = (await thumbnailProvider?.()) ?? thumbnail
      } catch {
        /* thumbnail is best-effort */
      }
      // Re-read after the async thumbnail so we persist the freshest state.
      const latest = get()
      if (!latest.project || !latest.doc || latest.project.id !== project.id) return
      const updated: Project = {
        ...latest.project,
        document: latest.doc,
        updatedAt: new Date().toISOString(),
        thumbnail,
      }
      try {
        await getData().saveProject(updated)
        const after = get()
        const stillCurrent = after.doc === updated.document && after.project?.name === updated.name
        set({ project: updated, saveState: stillCurrent ? 'saved' : 'unsaved', lastSavedAt: updated.updatedAt })
        if (!stillCurrent) get().scheduleSave()
      } catch (e) {
        console.error(e)
        set({ saveState: 'error' })
      }
    },
  }
})

export const selectSelectedElements = (s: EditorState) =>
  s.doc ? s.doc.elements.filter((e) => s.selectedIds.includes(e.id)) : []
