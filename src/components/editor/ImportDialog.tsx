import { useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { useEditor } from '@/store/useEditor'
import { importMinimapFiles } from '@/lib/importer'
import { canvasApi } from '@/lib/canvasApi'
import { cn } from '@/lib/utils'

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [mode, setMode] = useState<'base' | 'image'>('base')
  const fileRef = useRef<HTMLInputElement>(null)

  const handle = async (list: FileList | File[]) => {
    const files = Array.from(list)
    if (!files.length) return
    setBusy(true)
    try {
      if (mode === 'image') {
        await canvasApi.addImageFiles(files)
      } else {
        const res = await importMinimapFiles(files)
        useEditor.getState().commit((d) => {
          d.baseMap = { ...d.baseMap, preset: 'custom', src: res.src, width: res.width, height: res.height }
        })
        for (const w of res.warnings) toast.info('Import note', w)
        toast.success(res.tiles > 1 ? `Stitched ${res.tiles} tiles` : 'Base map replaced', `${res.width} × ${res.height}px`)
        setTimeout(() => canvasApi.fit(), 50)
      }
      onClose()
    } catch (e) {
      toast.error('Import failed', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Import minimap" description="Bring existing tiles or artwork into this project." size="sm">
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-900 p-1 text-xs">
        {(
          [
            ['base', 'Replace base map'],
            ['image', 'Add as image layer'],
          ] as const
        ).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} className={cn('rounded-lg px-3 py-2 font-medium transition', mode === m ? 'bg-ink-700 text-ink-100' : 'text-ink-400 hover:text-ink-200')}>
            {label}
          </button>
        ))}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          void handle(e.dataTransfer.files)
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
          drag ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-900/40 hover:border-ink-500',
        )}
      >
        <input ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.zip,.ytd" className="hidden" onChange={(e) => e.target.files && void handle(e.target.files)} />
        {busy ? <Loader2 className="h-7 w-7 animate-spin text-brand-400" /> : <Upload className="h-7 w-7 text-ink-400" />}
        <p className="mt-3 text-sm font-semibold">Drop your minimap files here</p>
        <p className="mt-1 text-xs text-ink-400">
          {mode === 'base' ? '.png / .jpg / .webp frames · split tiles · .zip folders' : 'PNG, JPG or WebP images'}
        </p>
        {mode === 'base' && (
          <p className="mt-3 text-[11px] text-ink-500">
            Tiles named <code className="rounded bg-ink-800 px-1 text-ink-300">minimap_sea_X_Y</code> are stitched automatically.
          </p>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}
