import { useEffect } from 'react'
import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { toast } from '@/components/ui/Toast'
import { hasClipboard } from '@/lib/clipboard'
import { rotatePoint } from '@/lib/geometry'
import type { ToolId } from '@/types'

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select',
  h: 'move',
  t: 'text',
  z: 'zone',
  l: 'line',
  p: 'polygon',
  m: 'marker',
  c: 'color',
}

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable)

/** Replaces a screenshot left in the system clipboard, so Ctrl+V pastes the copied elements. */
function markSystemClipboard(count: number) {
  try {
    void navigator.clipboard?.writeText(`LABSEVE7 map elements (${count})`).catch(() => {})
  } catch {
    /* clipboard API unavailable */
  }
}

function pasteElements() {
  const s = useEditor.getState()
  if (!hasClipboard()) return
  const n = s.paste(canvasApi.visibleRect())
  if (n) toast.success(`Pasted ${n} element${n === 1 ? '' : 's'}`)
}

export function useShortcuts(opts: { onExport: () => void }) {
  useEffect(() => {
    // Ctrl+V: the paste event carries clipboard images (screenshots become image
    // elements); without one, the copied map elements are pasted.
    let pasteHandled = false
    const onPaste = (e: ClipboardEvent) => {
      if (isEditable(e.target) || !useEditor.getState().doc) return
      pasteHandled = true
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type))
      e.preventDefault()
      if (files.length) void canvasApi.addImageFiles(files)
      else pasteElements()
    }
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState()
      if (!s.doc) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // Ctrl+S must work even inside inputs.
      if (mod && key === 's') {
        e.preventDefault()
        void s.save().then(() => toast.success('Project saved'))
        return
      }
      if (isEditable(e.target)) return

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if (mod && key === 'y') {
        e.preventDefault()
        s.redo()
        return
      }
      if (mod && (key === 'c' || key === 'x')) {
        if (!s.selectedIds.length || window.getSelection()?.toString()) return
        e.preventDefault()
        const n = key === 'c' ? s.copySelected() : s.cutSelected()
        if (n) {
          markSystemClipboard(n)
          toast.success(`${key === 'c' ? 'Copied' : 'Cut'} ${n} element${n === 1 ? '' : 's'}`)
        }
        return
      }
      if (mod && key === 'v') {
        // Browsers that don't fire `paste` outside text fields still paste elements.
        pasteHandled = false
        window.setTimeout(() => {
          if (!pasteHandled) pasteElements()
        }, 0)
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        s.duplicateSelected()
        return
      }
      if (mod && key === 'a') {
        e.preventDefault()
        s.select(s.doc.elements.filter((el) => el.visible && !el.locked).map((el) => el.id))
        return
      }
      if (mod && key === 'e') {
        e.preventDefault()
        opts.onExport()
        return
      }
      if (mod && (key === '=' || key === '+')) {
        e.preventDefault()
        canvasApi.zoomBy(1.25)
        return
      }
      if (mod && key === '-') {
        e.preventDefault()
        canvasApi.zoomBy(1 / 1.25)
        return
      }
      if (mod && key === '0') {
        e.preventDefault()
        canvasApi.zoomTo(1)
        return
      }
      if (mod) return

      switch (key) {
        case 'delete':
        case 'backspace':
          e.preventDefault()
          if (s.pointEditId) {
            // While editing points, Delete removes the selected point, never the shape.
            if (s.activeVertex !== null && !s.deleteVertex(s.pointEditId, s.activeVertex)) toast.info('Cannot remove this point', 'Zones need at least 3 points, lines 2.')
            return
          }
          s.deleteSelected()
          return
        case 'escape':
          if (canvasApi.hasDraft()) canvasApi.cancelDraft()
          else if (s.pointEditId) s.setPointEdit(null)
          else if (s.selectedIds.length) s.clearSelection()
          else s.setTool('select')
          return
        case 'enter':
          if (canvasApi.hasDraft()) {
            e.preventDefault()
            canvasApi.finishDraft()
          } else if (s.pointEditId) {
            s.setPointEdit(null)
          } else if (s.selectedIds.length === 1) {
            const el = s.doc.elements.find((x) => x.id === s.selectedIds[0])
            if (el && (el.type === 'zone' || el.type === 'line')) {
              e.preventDefault()
              s.setPointEdit(el.id)
            }
          }
          return
        case 'g':
          s.updateDocument({ grid: { ...s.doc.grid, enabled: !s.doc.grid.enabled } })
          return
        case '+':
        case '=':
          canvasApi.zoomBy(1.25)
          return
        case '-':
          canvasApi.zoomBy(1 / 1.25)
          return
        case '!':
        case '1':
          if (e.shiftKey) canvasApi.fit()
          return
        case '[':
          if (s.selectedIds.length === 1) s.moveLayer(s.selectedIds[0], e.shiftKey ? 'bottom' : 'down')
          return
        case ']':
          if (s.selectedIds.length === 1) s.moveLayer(s.selectedIds[0], e.shiftKey ? 'top' : 'up')
          return
        case 'arrowup':
        case 'arrowdown':
        case 'arrowleft':
        case 'arrowright': {
          if (!s.selectedIds.length) return
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
          const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
          const vi = s.activeVertex
          if (s.pointEditId && vi !== null) {
            // Nudge the selected point (in the shape's own, possibly rotated, frame).
            s.commit((d) => {
              d.elements = d.elements.map((el) => {
                if (el.id !== s.pointEditId || (el.type !== 'zone' && el.type !== 'line')) return el
                const local = rotatePoint(dx, dy, -el.rotation)
                const points = [...el.points]
                points[vi * 2] += local.x
                points[vi * 2 + 1] += local.y
                return { ...el, points }
              })
            })
            return
          }
          s.commit((d) => {
            d.elements = d.elements.map((el) => (s.selectedIds.includes(el.id) && !el.locked ? { ...el, x: el.x + dx, y: el.y + dy } : el))
          })
          return
        }
        default:
          break
      }
      const tool = TOOL_KEYS[key]
      if (tool) {
        s.setTool(tool)
        return
      }
      if (key === 'i') {
        // Image tool: trigger the toolbar's hidden file input.
        document.querySelector<HTMLInputElement>('input[type=file][accept^="image/png"]')?.click()
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [opts])
}
