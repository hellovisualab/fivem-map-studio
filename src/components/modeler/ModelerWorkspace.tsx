import { useMemo, useRef, useState, type ReactNode } from 'react'
import * as THREE from 'three'
import {
  ArrowUpFromLine,
  Box,
  ChevronDown,
  Crosshair,
  FileDown,
  FolderOpen,
  Import,
  Keyboard,
  Magnet,
  MousePointer2,
  Move3d,
  Redo2,
  Rotate3d,
  Scale3d,
  ScanEye,
  Scissors,
  SquareDashed,
  Undo2,
} from 'lucide-react'
import { importObject3D } from '@/lib/modeler/build'
import { MODEL_FILE_EXT, docStats, parseDoc, serializeDoc } from '@/lib/modeler/doc'
import { meshStats } from '@/lib/modeler/mesh'
import { addPrimitive, setSelectMode, toggleEditMode } from '@/lib/modeler/ops'
import type { SelectMode } from '@/lib/modeler/types'
import { ingestPropFiles, PROP_ACCEPT } from '@/lib/propLoad'
import { disposeObject } from '@/lib/propGeometry'
import { activeObject, useModeler, type ModelerTool, type Shading } from '@/store/useModeler'
import { ModelerViewport } from '@/components/modeler/ModelerViewport'
import { ModelerPanels } from '@/components/modeler/ModelerPanels'
import { PopupMenu, type MenuItem } from '@/components/modeler/PopupMenu'
import { addMenu, meshMenu, objectMenu, selectMenu, viewMenu } from '@/components/modeler/menus'
import { viewport } from '@/components/modeler/bridge'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { cn, downloadBlob, uid } from '@/lib/utils'

const st = () => useModeler.getState()

function IconButton({ active, title, onClick, children, disabled }: { active?: boolean; title: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md transition disabled:opacity-30',
        active ? 'bg-brand-500/25 text-brand-100' : 'text-ink-300 hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
    </button>
  )
}

const VERT_ICON = (
  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2.5" y="2.5" width="11" height="11" opacity="0.45" />
    <rect x="11" y="1" width="4" height="4" fill="currentColor" stroke="none" />
  </svg>
)
const EDGE_ICON = (
  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2.5" y="2.5" width="11" height="11" opacity="0.45" />
    <line x1="2.5" y1="2.5" x2="13.5" y2="2.5" strokeWidth="2.6" />
  </svg>
)
const FACE_ICON = (
  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="2.5" y="2.5" width="11" height="11" fill="currentColor" fillOpacity="0.6" />
  </svg>
)

const SHORTCUTS: [string, string][] = [
  ['Tab', 'Object / Edit mode'],
  ['1 · 2 · 3', 'Vertex / Edge / Face select (edit mode)'],
  ['Click · Shift+click', 'Select · add to selection'],
  ['Drag', 'Box select (Shift add, Ctrl remove)'],
  ['Alt+click', 'Select edge loop (Ctrl+Alt: ring)'],
  ['A · Alt+A · Ctrl+I', 'Select all · none · invert'],
  ['L · Ctrl+L', 'Select linked under mouse · linked to selection'],
  ['G · R · S', 'Move · Rotate · Scale — then X/Y/Z, a number, Enter'],
  ['Shift+A', 'Add object'],
  ['Shift+D', 'Duplicate'],
  ['X · Delete', 'Delete menu'],
  ['E', 'Extrude'],
  ['I', 'Inset faces (I again: individual)'],
  ['Ctrl+R', 'Loop cut (wheel: number of cuts)'],
  ['F', 'Fill: make a face from vertices'],
  ['M', 'Merge vertices'],
  ['P', 'Separate selection into an object'],
  ['Shift+N · Alt+N', 'Recalculate · flip normals'],
  ['Ctrl+J', 'Join objects'],
  ['Ctrl+A', 'Apply transforms'],
  ['H · Alt+H', 'Hide · reveal'],
  ['Shift+S', 'Snap / 3D cursor'],
  ['Shift+right click', 'Place the 3D cursor'],
  ['Middle drag · Alt+drag', 'Orbit'],
  ['Shift+middle drag', 'Pan'],
  ['Wheel', 'Zoom'],
  ['Numpad 1 · 3 · 7', 'Front · right · top (Ctrl: opposite)'],
  ['Numpad . · Home', 'Frame selected · frame all'],
  ['Alt+Z · Shift+Z', 'X-ray · wireframe'],
  ['Ctrl+Z · Ctrl+Shift+Z', 'Undo · redo'],
]

function StatusBar() {
  const doc = useModeler((s) => s.doc)
  const mode = useModeler((s) => s.mode)
  const selected = useModeler((s) => s.selected)
  const meshSel = useModeler((s) => s.meshSel)
  const obj = useModeler((s) => activeObject(s))
  const stats = useMemo(() => docStats(doc), [doc])
  const base = useMemo(() => (obj && mode === 'edit' ? meshStats(obj.mesh) : null), [obj, mode])
  const hint =
    mode === 'edit'
      ? 'Click select · G/R/S transform · E extrude · I inset · Ctrl+R loop cut · X delete · right click menu'
      : 'Click select · G/R/S transform · Shift+A add · Tab edit mode · Shift+D duplicate · right click menu'
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-ink-800 bg-ink-950 px-3 text-[11px] text-ink-400">
      <span className="min-w-0 flex-1 truncate">{hint}</span>
      {base ? (
        <span className="font-mono whitespace-nowrap text-ink-300">
          Verts {meshSel.verts.size}/{base.verts} · Edges {meshSel.edges.size}/{base.edges} · Faces {meshSel.faces.size}/{base.faces} · Tris {base.tris}
        </span>
      ) : (
        <span className="font-mono whitespace-nowrap text-ink-300">
          Objects {selected.length}/{doc.objects.length} · Verts {stats.verts.toLocaleString()} · Tris {stats.tris.toLocaleString()}
        </span>
      )}
    </div>
  )
}

export function ModelerWorkspace({ name, onDone }: { name: string; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const openRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [help, setHelp] = useState(false)
  const mode = useModeler((s) => s.mode)
  const selectMode = useModeler((s) => s.selectMode)
  const tool = useModeler((s) => s.tool)
  const xray = useModeler((s) => s.xray)
  const shading = useModeler((s) => s.shading)
  const snap = useModeler((s) => s.snap)
  const canUndo = useModeler((s) => s.past.length > 0)
  const canRedo = useModeler((s) => s.future.length > 0)
  const hasActive = useModeler((s) => !!activeObject(s))

  const openAt = (e: React.MouseEvent, items: MenuItem[]) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const base = root.current!.getBoundingClientRect()
    setMenu({ x: r.left - base.left, y: r.bottom - base.top + 2, items })
  }

  const saveModel = () => {
    const blob = new Blob([serializeDoc(st().doc, name)], { type: 'application/json' })
    downloadBlob(blob, `${name}${MODEL_FILE_EXT}`)
  }

  const fileItems = (): MenuItem[] => [
    { label: 'Save model', hint: MODEL_FILE_EXT, icon: <FileDown className="h-3.5 w-3.5" />, onSelect: saveModel },
    { label: 'Open model…', icon: <FolderOpen className="h-3.5 w-3.5" />, onSelect: () => openRef.current?.click() },
    { label: 'Import mesh (GLB, OBJ, FBX, STL)…', icon: <Import className="h-3.5 w-3.5" />, onSelect: () => importRef.current?.click() },
  ]

  const importMesh = async (files: FileList) => {
    try {
      const loaded = await ingestPropFiles(files)
      let doc = st().doc
      const ids: string[] = []
      for (const item of loaded) {
        const box = new THREE.Box3().setFromObject(item.object, true)
        const size = box.isEmpty() ? 0 : Math.max(...box.getSize(new THREE.Vector3()).toArray())
        // FBX / OBJ exported in centimetres show up 100x too big
        if (size > 60) {
          item.object.scale.multiplyScalar(0.01)
          toast.info(item.name, 'Looked like centimetres: scaled to metres (×0.01).')
        }
        const { objects, materials } = importObject3D(item.object, () => uid(8))
        doc = { ...doc, objects: [...doc.objects, ...objects], materials: [...doc.materials, ...materials] }
        ids.push(...objects.map((o) => o.id))
        disposeObject(item.object)
        for (const url of item.sidecarUrls) URL.revokeObjectURL(url)
        for (const w of item.warnings) toast.info(item.name, w)
      }
      if (!ids.length) throw new Error('No meshes found in that file.')
      st().commit({ doc, mode: 'object', selected: ids, active: ids[ids.length - 1] })
      viewport.current?.frameSelected()
      toast.success('Imported', `${ids.length} object${ids.length === 1 ? '' : 's'} added`)
    } catch (err) {
      toast.error('Import failed', (err as Error).message)
    }
  }

  const tools: { id: ModelerTool; title: string; icon: ReactNode }[] = [
    { id: 'select', title: 'Select box (drag to box select)', icon: <MousePointer2 className="h-4 w-4" /> },
    { id: 'cursor', title: '3D cursor (click to place)', icon: <Crosshair className="h-4 w-4" /> },
    { id: 'move', title: 'Move gizmo (G)', icon: <Move3d className="h-4 w-4" /> },
    { id: 'rotate', title: 'Rotate gizmo (R)', icon: <Rotate3d className="h-4 w-4" /> },
    { id: 'scale', title: 'Scale gizmo (S)', icon: <Scale3d className="h-4 w-4" /> },
  ]
  const selectModes: { id: SelectMode; title: string; icon: ReactNode }[] = [
    { id: 'vert', title: 'Vertex select (1)', icon: VERT_ICON },
    { id: 'edge', title: 'Edge select (2)', icon: EDGE_ICON },
    { id: 'face', title: 'Face select (3)', icon: FACE_ICON },
  ]
  const shadings: { id: Shading; title: string; label: string }[] = [
    { id: 'wireframe', title: 'Wireframe (Shift+Z)', label: 'Wire' },
    { id: 'solid', title: 'Solid', label: 'Solid' },
    { id: 'material', title: 'Material preview', label: 'Material' },
  ]

  const menuButton = (label: string, items: () => MenuItem[]) => (
    <button type="button" onClick={(e) => openAt(e, items())} className="rounded-md px-2 py-1 text-[12px] text-ink-300 hover:bg-white/10 hover:text-white">
      {label}
    </button>
  )

  return (
    <div ref={root} className="relative flex h-full min-h-0 flex-col bg-ink-950">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b border-ink-800 bg-ink-900 px-2 py-1">
        <button
          type="button"
          onClick={toggleEditMode}
          disabled={!hasActive && mode === 'object'}
          title="Switch mode (Tab)"
          className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-850 px-2 py-1 text-[12px] text-ink-100 hover:border-ink-500 disabled:opacity-40"
        >
          {mode === 'edit' ? <SquareDashed className="h-3.5 w-3.5 text-orange-300" /> : <Box className="h-3.5 w-3.5 text-orange-300" />}
          {mode === 'edit' ? 'Edit Mode' : 'Object Mode'}
          <ChevronDown className="h-3 w-3 text-ink-500" />
        </button>
        {mode === 'edit' && (
          <div className="flex rounded-md border border-ink-700 bg-ink-850 p-0.5">
            {selectModes.map((m) => (
              <IconButton key={m.id} title={m.title} active={selectMode === m.id} onClick={() => setSelectMode(m.id)}>
                {m.icon}
              </IconButton>
            ))}
          </div>
        )}
        <div className="mx-1 h-5 w-px bg-ink-700" />
        {menuButton('View', viewMenu)}
        {menuButton('Select', selectMenu)}
        {menuButton('Add', addMenu)}
        {mode === 'edit' ? menuButton('Mesh', meshMenu) : menuButton('Object', objectMenu)}
        {menuButton('File', fileItems)}
        <div className="flex-1" />
        <IconButton title="X-ray (Alt+Z)" active={xray} onClick={() => st().setXray(!xray)}>
          <ScanEye className="h-4 w-4" />
        </IconButton>
        <div className="flex rounded-md border border-ink-700 bg-ink-850 p-0.5">
          {shadings.map((s) => (
            <button key={s.id} type="button" title={s.title} onClick={() => st().setShading(s.id)} className={cn('rounded px-2 py-0.5 text-[11px]', shading === s.id ? 'bg-brand-500/25 text-brand-100' : 'text-ink-400 hover:text-white')}>
              {s.label}
            </button>
          ))}
        </div>
        <IconButton title="Snapping: 0.1 m · 5° · 0.1 (hold Ctrl to toggle while moving)" active={snap} onClick={() => st().setSnap(!snap)}>
          <Magnet className="h-4 w-4" />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-ink-700" />
        <IconButton title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => st().undo()}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => st().redo()}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
        <IconButton title="Keyboard shortcuts" onClick={() => setHelp(true)}>
          <Keyboard className="h-4 w-4" />
        </IconButton>
        <button type="button" onClick={onDone} className="ml-1 rounded-md bg-brand-500 px-3 py-1 text-[12px] font-semibold text-white hover:bg-brand-400" title="Back to the pack (the prop is updated)">
          Done
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_300px]">
        <div className="relative min-h-[420px]">
          <ModelerViewport />
          <div className="absolute top-10 left-2 z-20 flex flex-col gap-0.5 rounded-lg border border-ink-700 bg-ink-900/90 p-1 backdrop-blur">
            {tools.map((t) => (
              <IconButton key={t.id} title={t.title} active={tool === t.id} onClick={() => st().setTool(t.id)}>
                {t.icon}
              </IconButton>
            ))}
            <div className="my-0.5 h-px bg-ink-700" />
            {mode === 'edit' ? (
              <>
                <IconButton title="Extrude (E)" onClick={() => viewport.current?.startExtrude()}>
                  <ArrowUpFromLine className="h-4 w-4" />
                </IconButton>
                <IconButton title="Inset faces (I)" onClick={() => viewport.current?.startInset()}>
                  <SquareDashed className="h-4 w-4" />
                </IconButton>
                <IconButton title="Loop cut (Ctrl+R)" onClick={() => viewport.current?.startLoopCut()}>
                  <Scissors className="h-4 w-4" />
                </IconButton>
              </>
            ) : (
              <IconButton title="Add cube (Shift+A for more)" onClick={() => addPrimitive('cube')}>
                <Box className="h-4 w-4" />
              </IconButton>
            )}
          </div>
        </div>
        <aside className="min-h-0 overflow-hidden border-t border-ink-800 bg-ink-950 md:border-t-0 md:border-l">
          <ModelerPanels />
        </aside>
      </div>
      <StatusBar />

      <input
        ref={openRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          file
            .text()
            .then((text) => {
              const { doc } = parseDoc(text)
              st().load(doc)
              viewport.current?.frameAll()
              toast.success('Model opened', file.name)
            })
            .catch((err: Error) => toast.error('Open failed', err.message))
        }}
      />
      <input
        ref={importRef}
        type="file"
        multiple
        accept={PROP_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void importMesh(e.target.files)
          e.target.value = ''
        }}
      />
      {menu && <PopupMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      <Modal open={help} onClose={() => setHelp(false)} title="Modeler shortcuts (Blender keymap)">
        <div className="grid max-h-[60vh] grid-cols-1 gap-x-6 gap-y-1 overflow-auto text-[12px] sm:grid-cols-2">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-ink-800/60 py-1">
              <span className="text-ink-300">{v}</span>
              <kbd className="font-mono text-[11px] whitespace-nowrap text-brand-300">{k}</kbd>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
