import { Modal } from '@/components/ui/Modal'

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'Tools',
    rows: [
      ['V', 'Select'],
      ['H / Space + drag', 'Pan'],
      ['Z', 'Rectangle zone'],
      ['P', 'Polygon territory'],
      ['L', 'Line'],
      ['M', 'Marker'],
      ['T', 'Text label'],
      ['I', 'Image'],
      ['C', 'Paint color'],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
      ['Ctrl+C / X / V', 'Copy / cut / paste'],
      ['Ctrl+D', 'Duplicate'],
      ['Ctrl+A', 'Select all'],
      ['Delete', 'Delete selection'],
      ['Arrows (Shift = 10 px)', 'Nudge'],
      ['Shift+] / Shift+[', 'Bring to front / send to back'],
      ['] / [', 'Forward / backward one layer'],
    ],
  },
  {
    title: 'Zones & lines',
    rows: [
      ['Double-click / Enter', 'Edit points'],
      ['Drag middle dot', 'Add a point'],
      ['Alt+click / Delete', 'Remove a point'],
      ['Alt + drag', 'Move without snapping'],
      ['Enter / Esc', 'Finish / cancel drawing'],
    ],
  },
  {
    title: 'View & file',
    rows: [
      ['Scroll / + / -', 'Zoom'],
      ['Shift+1', 'Zoom to fit'],
      ['Ctrl+0', 'Zoom 100%'],
      ['G', 'Toggle grid'],
      ['Ctrl+S', 'Save'],
      ['Ctrl+E', 'Export'],
      ['?', 'This list'],
    ],
  },
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" description="Right-click the map or a selection for the same actions." size="lg">
      <div className="scrollbar-thin grid gap-x-8 gap-y-5 overflow-y-auto p-5 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-ink-500 uppercase">{g.title}</p>
            <dl className="space-y-1.5">
              {g.rows.map(([keys, label]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-xs">
                  <dt className="text-ink-300">{label}</dt>
                  <dd>
                    <kbd className="rounded-md border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-sans text-[11px] whitespace-nowrap text-ink-200">{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Modal>
  )
}
