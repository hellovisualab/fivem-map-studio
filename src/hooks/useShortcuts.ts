import { useEffect } from 'react'
import { useEditor } from '@/store/useEditor'
import { canvasApi } from '@/lib/canvasApi'
import { toast } from '@/components/ui/Toast'
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

export function useShortcuts(opts: { onExport: () => void }) {
  useEffect(() => {
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
          s.deleteSelected()
          return
        case 'escape':
          if (canvasApi.hasDraft()) canvasApi.cancelDraft()
          else if (s.selectedIds.length) s.clearSelection()
          else s.setTool('select')
          return
        case 'enter':
          if (canvasApi.hasDraft()) {
            e.preventDefault()
            canvasApi.finishDraft()
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
    return () => window.removeEventListener('keydown', onKey)
  }, [opts])
}
