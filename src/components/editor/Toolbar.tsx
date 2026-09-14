import { useRef, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Hexagon,
  Image as ImageIcon,
  MapPin,
  Move,
  MousePointer2,
  PaintBucket,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react'
import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { MARKER_ICONS, PALETTE, ZONE_TYPES } from '@/lib/constants'
import { MARKER_PATHS } from '@/lib/icons'
import { cn } from '@/lib/utils'
import type { MarkerIcon, ToolId, ZoneType } from '@/types'

export const TOOLS: { id: ToolId; label: string; icon: typeof MousePointer2; key: string }[] = [
  { id: 'select', label: 'Select', icon: MousePointer2, key: 'V' },
  { id: 'move', label: 'Move / pan', icon: Move, key: 'H' },
  { id: 'text', label: 'Text', icon: Type, key: 'T' },
  { id: 'image', label: 'Image', icon: ImageIcon, key: 'I' },
  { id: 'zone', label: 'Zone (rectangle)', icon: Square, key: 'Z' },
  { id: 'line', label: 'Line', icon: Slash, key: 'L' },
  { id: 'polygon', label: 'Polygon zone', icon: Hexagon, key: 'P' },
  { id: 'marker', label: 'Marker', icon: MapPin, key: 'M' },
  { id: 'color', label: 'Paint color', icon: PaintBucket, key: 'C' },
]

function ToolButton({
  active,
  onClick,
  label,
  shortcut,
  children,
  disabled,
  danger,
}: {
  active?: boolean
  onClick: () => void
  label: string
  shortcut?: string
  children: ReactNode
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      className={cn(
        'group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-150 sm:h-10 sm:w-10',
        active
          ? 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/50 shadow-[0_0_20px_-6px_rgba(255,138,31,0.6)]'
          : danger
            ? 'text-ink-400 hover:bg-red-500/10 hover:text-red-300'
            : 'text-ink-400 hover:bg-ink-700/70 hover:text-ink-100',
        disabled && 'pointer-events-none opacity-35',
      )}
    >
      {children}
      <span className="pointer-events-none absolute left-full ml-3 hidden whitespace-nowrap rounded-md border border-ink-700 bg-ink-900 px-2 py-1 text-xs text-ink-100 opacity-0 shadow-soft transition group-hover:opacity-100 lg:block">
        {label}
        {shortcut && <kbd className="ml-2 rounded bg-ink-700 px-1 text-[10px] text-ink-300">{shortcut}</kbd>}
      </span>
    </button>
  )
}

export function Toolbar({ orientation = 'vertical' }: { orientation?: 'vertical' | 'horizontal' }) {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const hasSelection = useEditor((s) => s.selectedIds.length > 0)
  const { undo, redo, deleteSelected } = useEditor.getState()
  const fileRef = useRef<HTMLInputElement>(null)

  const pick = (id: ToolId) => {
    if (id === 'image') {
      fileRef.current?.click()
      return
    }
    setTool(id)
  }

  const vertical = orientation === 'vertical'

  return (
    <div className={cn('flex', vertical ? 'flex-col items-start gap-2' : 'w-full flex-col gap-2')}>
      <div className={cn('panel flex gap-1 p-1.5', vertical ? 'flex-col' : 'scrollbar-thin flex-row overflow-x-auto')}>
        {TOOLS.map((t) => (
          <ToolButton key={t.id} active={tool === t.id} onClick={() => pick(t.id)} label={t.label} shortcut={t.key}>
            <t.icon className="h-[18px] w-[18px]" />
          </ToolButton>
        ))}
        <div className={cn('bg-ink-700', vertical ? 'my-1 h-px w-full' : 'mx-1 w-px self-stretch')} />
        <ToolButton onClick={undo} disabled={!canUndo} label="Undo" shortcut="Ctrl+Z">
          <Undo2 className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton onClick={redo} disabled={!canRedo} label="Redo" shortcut="Ctrl+Shift+Z">
          <Redo2 className="h-[18px] w-[18px]" />
        </ToolButton>
        <ToolButton onClick={deleteSelected} disabled={!hasSelection} label="Delete" shortcut="Del" danger>
          <Trash2 className="h-[18px] w-[18px]" />
        </ToolButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : []
            e.target.value = ''
            if (files.length) void canvasApi.addImageFiles(files)
          }}
        />
      </div>
      <ToolOptions />
    </div>
  )
}

function ToolOptions() {
  const tool = useEditor((s) => s.tool)
  const zoneType = useEditor((s) => s.zoneType)
  const markerIcon = useEditor((s) => s.markerIcon)
  const paintColor = useEditor((s) => s.paintColor)
  const { setZoneType, setMarkerIcon, setPaintColor } = useEditor.getState()

  const show = tool === 'zone' || tool === 'polygon' || tool === 'marker' || tool === 'color'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key={tool}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.16 }}
          className="panel w-full p-2 lg:w-56"
        >
          {(tool === 'zone' || tool === 'polygon') && (
            <>
              <p className="label px-1">Zone type</p>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(ZONE_TYPES) as ZoneType[]).map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoneType(z)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition',
                      zoneType === z ? 'bg-ink-700 text-ink-100 ring-1 ring-brand-500/50' : 'text-ink-300 hover:bg-ink-700/60',
                    )}
                  >
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_TYPES[z].color }} />
                    {ZONE_TYPES[z].label.replace(' zone', '').replace(' area', '')}
                  </button>
                ))}
              </div>
              <p className="mt-2 px-1 text-[11px] text-ink-500">
                {tool === 'zone' ? 'Drag on the map to draw a rectangle.' : 'Click to place vertices, Enter to close.'}
              </p>
            </>
          )}
          {tool === 'marker' && (
            <>
              <p className="label px-1">Marker icon</p>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(MARKER_ICONS) as MarkerIcon[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMarkerIcon(m)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] transition',
                      markerIcon === m ? 'bg-ink-700 text-ink-100 ring-1 ring-brand-500/50' : 'text-ink-400 hover:bg-ink-700/60',
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white/80" style={{ background: MARKER_ICONS[m].color }}>
                      <MarkerGlyph icon={m} />
                    </span>
                    {MARKER_ICONS[m].label}
                  </button>
                ))}
              </div>
            </>
          )}
          {tool === 'color' && (
            <>
              <p className="label px-1">Paint color</p>
              <div className="grid grid-cols-6 gap-1.5 px-1">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPaintColor(c)}
                    className={cn('h-6 w-6 rounded-md border border-white/10 transition hover:scale-110', paintColor === c && 'ring-2 ring-brand-400 ring-offset-2 ring-offset-ink-850')}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 px-1">
                <input type="color" value={paintColor} onChange={(e) => setPaintColor(e.target.value)} />
                <input className="field-sm font-mono" value={paintColor} onChange={(e) => setPaintColor(e.target.value)} />
              </div>
              <p className="mt-2 px-1 text-[11px] text-ink-500">Click any element to apply this color.</p>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function MarkerGlyph({ icon, className }: { icon: MarkerIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('h-3.5 w-3.5 fill-white', className)}>
      <path d={MARKER_PATHS[icon]} />
    </svg>
  )
}
