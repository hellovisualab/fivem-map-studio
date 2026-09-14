import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, FileImage, Loader2, Upload, X } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { MAP_FOLDERS, MAP_PRESET_IDS, PRESETS } from '@/lib/constants'
import { resolvePresetSource, type PresetSource } from '@/lib/basemaps'
import { createDocument } from '@/lib/elements'
import { importMinimapFiles, type ImportResult } from '@/lib/importer'
import { getData } from '@/lib/data'
import { useAuth } from '@/store/useAuth'
import { cn, uid } from '@/lib/utils'
import type { BaseMapPreset, HistoryEntry, Project } from '@/types'

export function NewProject({ importMode = false }: { importMode?: boolean }) {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const [name, setName] = useState('')
  const [preset, setPreset] = useState<BaseMapPreset>(importMode ? 'custom' : 'color')
  const [sources, setSources] = useState<Partial<Record<BaseMapPreset, PresetSource>>>({})
  const [custom, setCustom] = useState<ImportResult | null>(null)
  const [importing, setImporting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      for (const id of MAP_PRESET_IDS) {
        const source = await resolvePresetSource(id)
        if (!alive) return
        setSources((p) => ({ ...p, [id]: source }))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const handleFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list)
    if (!files.length) return
    setImporting(true)
    try {
      const res = await importMinimapFiles(files)
      setCustom(res)
      setPreset('custom')
      for (const w of res.warnings) toast.info('Import note', w)
      toast.success(res.tiles > 1 ? `Stitched ${res.tiles} tiles` : 'Minimap imported', `${res.width} × ${res.height}px`)
    } catch (e) {
      toast.error('Import failed', (e as Error).message)
    } finally {
      setImporting(false)
    }
  }, [])

  const previewSrc = preset === 'custom' ? custom?.src : sources[preset]?.preview
  const selectedSource = preset === 'custom' ? null : sources[preset]

  const create = async () => {
    if (!user) return
    if (preset === 'custom' && !custom) {
      toast.error('Upload a minimap first', 'Drop PNG / JPG / WebP / DDS frames, tiles or a ZIP.')
      return
    }
    setCreating(true)
    try {
      const now = new Date().toISOString()
      const project: Project = {
        id: uid(12),
        ownerId: user.id,
        name: name.trim() || (preset === 'custom' ? 'Imported minimap' : 'Untitled minimap'),
        createdAt: now,
        updatedAt: now,
        document: createDocument(
          preset,
          preset === 'custom'
            ? custom ?? undefined
            : selectedSource?.real
              ? // Presets keep src empty and are resolved from /maps/ on every load.
                { src: '', width: selectedSource.width, height: selectedSource.height, real: true }
              : undefined,
        ),
      }
      const data = getData()
      await data.createProject(project)
      await data.addHistory({
        id: uid(),
        projectId: project.id,
        projectName: project.name,
        action: preset === 'custom' ? 'imported' : 'created',
        at: now,
        detail: PRESETS.find((p) => p.id === preset)?.name,
        ownerId: user.id,
      } as HistoryEntry)
      navigate(`/editor/${project.id}`)
    } catch (e) {
      toast.error('Could not create project', (e as Error).message)
      setCreating(false)
    }
  }

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <button onClick={() => navigate(-1)} className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{importMode ? 'Import minimap' : 'New project'}</h1>
        <p className="mt-1 text-sm text-ink-400">Pick a base map, name your project and jump into the editor.</p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <label className="block">
              <span className="label">Project name</span>
              <input className="field" placeholder="e.g. My RP map" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>

            <div>
              <span className="label">Start from a preset</span>
              {Object.values(sources).length > 0 && !Object.values(sources).some((s) => s?.real) && (
                <p className="mb-3 rounded-xl border border-ink-700 bg-ink-850/70 px-3 py-2 text-xs text-ink-400">
                  Presets are stylized previews. Drop your own GTA V minimap textures (one image or <code className="rounded bg-ink-800 px-1 text-ink-300">*_X_Y.png</code> tiles) into{' '}
                  {MAP_PRESET_IDS.map((id, i) => (
                    <span key={id}>
                      <code className="rounded bg-ink-800 px-1 text-ink-300">public/maps/{MAP_FOLDERS[id]}/</code>
                      {i < MAP_PRESET_IDS.length - 1 ? ', ' : ''}
                    </span>
                  ))}{' '}
                  to use the real maps, or import them below.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {PRESETS.map((p) => {
                  const active = preset === p.id
                  const source = p.id === 'custom' ? undefined : sources[p.id]
                  const src = p.id === 'custom' ? custom?.src : source?.preview
                  const tag =
                    p.id === 'custom'
                      ? p.tag
                      : source
                        ? source.real
                          ? `${source.width}×${source.height}${source.tiles > 1 ? ` · ${source.tiles} tiles` : ''}`
                          : 'Stylized preview'
                        : '…'
                  return (
                    <motion.button
                      key={p.id}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setPreset(p.id)
                        if (p.id === 'custom' && !custom) fileRef.current?.click()
                      }}
                      className={cn(
                        'panel relative overflow-hidden text-left transition',
                        active ? 'border-brand-500 shadow-glow' : 'hover:border-ink-500',
                      )}
                    >
                      <div className="relative aspect-[4/3] bg-ink-900">
                        {src ? (
                          <img src={src} alt={p.name} className="h-full w-full object-cover" />
                        ) : p.id === 'custom' ? (
                          <div className="grid-bg flex h-full w-full flex-col items-center justify-center gap-1 text-ink-500">
                            <Upload className="h-6 w-6" />
                            <span className="text-[11px]">Upload</span>
                          </div>
                        ) : (
                          <div className="shimmer h-full w-full" />
                        )}
                        {active && (
                          <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-ink-950">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold">{p.name}</p>
                        <span
                          className={cn(
                            'mt-1 inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                            source && !source.real ? 'border-ink-600 bg-ink-800 text-ink-400' : 'border-brand-500/30 bg-brand-500/10 text-brand-300',
                          )}
                        >
                          {tag}
                        </span>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Dropzone */}
            <div>
              <span className="label">Or import your own minimap</span>
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  void handleFiles(e.dataTransfer.files)
                }}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition',
                  dragOver ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-850/50 hover:border-ink-500',
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept=".png,.jpg,.jpeg,.webp,.dds,.zip,.ytd"
                  className="hidden"
                  onChange={(e) => e.target.files && void handleFiles(e.target.files)}
                />
                {importing ? (
                  <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 text-ink-300">
                    <Upload className="h-5 w-5" />
                  </div>
                )}
                <p className="mt-3 font-semibold">Drop your minimap files here</p>
                <p className="mt-1 text-xs text-ink-400">PNG · JPG · WebP · DDS frames · split tiles · ZIP folders · or click to browse</p>
                <p className="mt-3 text-[11px] text-ink-500">
                  Name your tiles <code className="rounded bg-ink-800 px-1 py-0.5 text-ink-300">minimap_sea_0_0</code> …{' '}
                  <code className="rounded bg-ink-800 px-1 py-0.5 text-ink-300">minimap_sea_2_1</code> and they will land on the right spot.
                </p>
              </div>
              <AnimatePresence>
                {custom && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm"
                  >
                    <FileImage className="h-4 w-4 text-brand-400" />
                    <span className="flex-1 text-ink-300">
                      Custom map ready · {custom.width} × {custom.height}px{custom.tiles > 1 ? ` · ${custom.tiles} tiles` : ''}
                    </span>
                    <button onClick={() => setCustom(null)} className="text-ink-500 hover:text-ink-200">
                      <X className="h-4 w-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Preview */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="panel overflow-hidden">
              <div className="relative aspect-[3/4] bg-ink-900">
                <AnimatePresence mode="wait">
                  {previewSrc ? (
                    <motion.img
                      key={previewSrc.slice(0, 64)}
                      src={previewSrc}
                      alt="Preview"
                      initial={{ opacity: 0, scale: 1.02 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn('h-full w-full', preset === 'custom' ? 'object-contain' : 'object-cover')}
                    />
                  ) : (
                    <motion.div key="empty" className="grid-bg flex h-full w-full flex-col items-center justify-center gap-2 text-ink-500">
                      <Upload className="h-6 w-6" />
                      <span className="text-xs">Upload a map to preview</span>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-950/90 to-transparent p-4">
                  <p className="text-xs text-ink-400">Preview</p>
                  <p className="font-semibold">{PRESETS.find((p) => p.id === preset)?.name}</p>
                </div>
              </div>
              <div className="p-4">
                <p className="text-sm text-ink-400">{PRESETS.find((p) => p.id === preset)?.description}</p>
                <Button className="mt-4 w-full" size="lg" loading={creating} onClick={create}>
                  Create Project
                </Button>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
