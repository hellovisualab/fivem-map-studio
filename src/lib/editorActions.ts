import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { hasClipboard } from '@/lib/clipboard'
import { toast } from '@/components/ui/Toast'

/** Editor commands shared by the keyboard shortcuts, the selection bar and the context menu. */

const plural = (n: number) => `${n} element${n === 1 ? '' : 's'}`

/** Replaces a screenshot left in the system clipboard, so Ctrl+V pastes the copied elements. */
function markSystemClipboard(count: number) {
  try {
    void navigator.clipboard?.writeText(`LABSEVE7 map elements (${count})`).catch(() => {})
  } catch {
    /* clipboard API unavailable */
  }
}

export function copySelection() {
  const n = useEditor.getState().copySelected()
  if (n) {
    markSystemClipboard(n)
    toast.success(`Copied ${plural(n)}`)
  }
  return n
}

export function cutSelection() {
  const n = useEditor.getState().cutSelected()
  if (n) {
    markSystemClipboard(n)
    toast.success(`Cut ${plural(n)}`)
  }
  return n
}

export function pasteClipboard() {
  if (!hasClipboard()) return 0
  const n = useEditor.getState().paste(canvasApi.visibleRect())
  if (n) toast.success(`Pasted ${plural(n)}`)
  return n
}

export function selectedElements() {
  const s = useEditor.getState()
  return s.doc?.elements.filter((e) => s.selectedIds.includes(e.id)) ?? []
}

/** Moves every selected element to the top (or bottom) of the stack, keeping their order. */
export function arrangeSelection(where: 'top' | 'bottom') {
  const s = useEditor.getState()
  const ids = new Set(s.selectedIds)
  if (!ids.size) return
  s.commit((d) => {
    const picked = d.elements.filter((e) => ids.has(e.id))
    const rest = d.elements.filter((e) => !ids.has(e.id))
    d.elements = where === 'top' ? [...rest, ...picked] : [...picked, ...rest]
  })
}

/** Locks the selection, or unlocks it when everything selected is already locked. */
export function toggleLockSelection() {
  const s = useEditor.getState()
  const els = selectedElements()
  if (!els.length) return
  const lock = !els.every((e) => e.locked)
  s.updateElements(
    els.map((e) => e.id),
    { locked: lock },
  )
  if (lock) s.setPointEdit(null)
}

export function hideSelection() {
  const s = useEditor.getState()
  const ids = s.selectedIds
  if (!ids.length) return
  s.updateElements(ids, { visible: false })
  s.clearSelection()
  toast.info(`Hid ${plural(ids.length)}`, 'Show them again from the Layers tab.')
}
