import { useCallback, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { ToolShell } from '@/components/tools/ToolShell'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import {
  collectTextures,
  exportOptimizedZip,
  optimizeAll,
  totals,
  type OptimizePreset,
  type TextureItem,
} from '@/lib/ytd'
import { gateToolExport } from '@/lib/toolExport'
import { cn, downloadBlob, formatBytes } from '@/lib/utils'

const PRESETS: { id: OptimizePreset; label: string; hint: string }[] = [
  { id: 'quality', label: 'Quality', hint: 'Up to 2K · high WebP' },
  { id: 'balanced', label: 'Balanced', hint: 'Up to 1K · good size' },
  { id: 'small', label: 'Small', hint: 'Up to 512 · aggressive' },
]

export function YtdOptimizer() {
  const [items, setItems] = useState<TextureItem[]>([])
  const [preset, setPreset] = useState<OptimizePreset>('balanced')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const ingest = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list)
    if (!files.length) return
    setBusy(true)
    try {
      const { items: loaded, warnings } = await collectTextures(files)
      for (const w of warnings) toast.info('Note', w)
      if (!loaded.length) {
        toast.error('No textures found', 'Drop PNG / JPG / WebP / DDS files or a ZIP of them.')
        return
      }
      const optimized = await optimizeAll(loaded, preset)
      setItems(optimized)
      toast.success(`Loaded ${optimized.length} texture${optimized.length === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error('Import failed', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [preset])

  const reoptimize = async (next: OptimizePreset) => {
    setPreset(next)
    if (!items.length) return
    setBusy(true)
    try {
      const base = items.map(({ optimizedBlob: _o, optimizedBytes: _b, ...rest }) => rest)
      setItems(await optimizeAll(base, next))
    } finally {
      setBusy(false)
    }
  }

  const doExport = async () => {
    if (!items.length) {
      toast.error('Nothing to export', 'Add textures first.')
      return
    }
    setBusy(true)
    try {
      if (!(await gateToolExport('YTD Optimizer'))) return
      const blob = await exportOptimizedZip(items, 'optimized_textures')
      downloadBlob(blob, 'optimized_textures.zip')
    } finally {
      setBusy(false)
    }
  }

  const sum = totals(items)

  return (
    <ToolShell
      title="YTD Optimizer"
      subtitle={items.length ? `${items.length} textures · ${sum.label}` : 'Drop textures to begin'}
      onExport={() => void doExport()}
      exportLoading={busy}
      exportDisabled={!items.length}
    >
      {!items.length ? (
        <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
          <h1 className="text-3xl font-extrabold tracking-tight">YTD Optimizer</h1>
          <p className="mt-2 max-w-lg text-center text-ink-400">
            Optimize your GTA V <span className="text-brand-400">.ytd</span> textures with one-click quality presets, or fine-tune every texture by hand.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              void ingest(e.dataTransfer.files)
            }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'mt-10 flex w-full max-w-xl cursor-pointer flex-col items-center rounded-3xl border-2 border-dashed px-8 py-16 text-center transition',
              drag ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-900/40 hover:border-ink-500',
            )}
          >
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".ytd,.zip,.png,.jpg,.jpeg,.webp,.dds"
              className="hidden"
              onChange={(e) => e.target.files && void ingest(e.target.files)}
            />
            {busy ? (
              <Loader2 className="h-10 w-10 animate-spin text-brand-400" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
                <Upload className="h-7 w-7" />
              </div>
            )}
            <p className="mt-4 text-lg font-semibold">
              Drop your <span className="text-brand-400">.ytd</span> / texture pack here
            </p>
            <p className="mt-1 text-sm text-ink-500">or click to browse · max 500 MB</p>
            <p className="mt-6 text-[11px] text-ink-600">Files aren't kept. Everything stays in this browser tab.</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void reoptimize(p.id)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-left text-sm transition',
                  preset === p.id ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-700 bg-ink-900 text-ink-300',
                )}
              >
                <p className="font-semibold">{p.label}</p>
                <p className="text-[11px] text-ink-500">{p.hint}</p>
              </button>
            ))}
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => fileRef.current?.click()}>
              Add more
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setItems([])}>
              Clear
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".ytd,.zip,.png,.jpg,.jpeg,.webp,.dds"
              className="hidden"
              onChange={(e) => e.target.files && void ingest(e.target.files)}
            />
          </div>

          <div className="panel flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
            <span className="text-ink-400">Saved {formatBytes(sum.saved)}</span>
            <span className="font-medium text-ink-200">{sum.label}</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <div key={item.id} className="panel overflow-hidden">
                <div className="aspect-square bg-ink-900">
                  {item.previewUrl && item.width > 0 ? (
                    <img src={item.previewUrl} alt={item.name} className="h-full w-full object-contain" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ink-500">DDS / no preview</div>
                  )}
                </div>
                <div className="space-y-1 p-3 text-xs">
                  <p className="truncate font-medium text-ink-200">{item.name}</p>
                  <p className="text-ink-500">
                    {item.width && item.height ? `${item.width}×${item.height} · ` : ''}
                    {formatBytes(item.originalBytes)}
                    {item.optimizedBytes != null ? ` → ${formatBytes(item.optimizedBytes)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolShell>
  )
}
