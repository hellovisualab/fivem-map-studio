import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Check, FileImage, Loader2, Upload, X } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { GlassBlobs } from '@/components/layout/GlassBlobs'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { MAP_FOLDERS, MAP_PRESET_IDS, PRESETS } from '@/lib/constants'
import { hasMapsManifest, presetStyle, resolvePresetSource, type PresetSource } from '@/lib/basemaps'
import { CAYO_PERICO, cayoPreview } from '@/lib/cayo'
import { createDocument } from '@/lib/elements'
import { importMinimapFiles, type ImportResult } from '@/lib/importer'
import { getData } from '@/lib/data'
import { useAuth } from '@/store/useAuth'
import { cn, uid } from '@/lib/utils'
import type { BaseMapPreset, HistoryEntry, Project } from '@/types'

/**
 * Explains why a preset is still stylized when files exist under /maps/ (bad
 * format, unsupported DDS codec, missing manifest…). Hidden when all is well.
 */
function TextureDiagnostics({ sources }: { sources: Partial<Record<BaseMapPreset, PresetSource>> }) {
  const [manifest, setManifest] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    hasMapsManifest().then((v) => alive && setManifest(v))
    return () => {
      alive = false
    }
  }, [])
  const entries = MAP_PRESET_IDS.map((id) => [id, sources[id]] as const).filter(([, s]) => s && (s.errors.length > 0 || (s.files.length > 0 && !s.real)))
  const allSettled = MAP_PRESET_IDS.every((id) => sources[id])
  if (!entries.length && manifest !== false) return null
  if (!allSettled) return null
  return (
    <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
      <p className="font-semibold text-amber-300">Texture diagnostics</p>
      {manifest === false && (
        <p className="mt-1 text-amber-200/80">
          <code className="bg-ink-800 rounded px-1">maps/manifest.json</code> was not served. The build must run{' '}
          <code className="bg-ink-800 rounded px-1">npm run build</code> (which indexes <code className="bg-ink-800 rounded px-1">public/maps/*</code>
          ); the app fell back to probing standard file names.
        </p>
      )}
      {entries.map(([id, s]) => (
        <div key={id} className="mt-1.5">
          <p className="text-ink-200">
            {PRESETS.find((p) => p.id === id)?.name} · <code className="bg-ink-800 text-ink-300 rounded px-1">public/maps/{MAP_FOLDERS[id]}/</code>
            {s!.files.length ? ` · ${s!.files.length} file${s!.files.length === 1 ? '' : 's'} indexed` : ' · no files indexed'}
          </p>
          <ul className="ml-3 list-disc text-amber-200/80">
            {s!.errors.slice(0, 6).map((e, i) => (
              <li key={i} className="break-all">
                {e}
              </li>
            ))}
            {s!.errors.length > 6 && <li>… {s!.errors.length - 6} more</li>}
          </ul>
        </div>
      ))}
    </div>
  )
}

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
  const [cayo, setCayo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const cayoThumb = useMemo(() => cayoPreview(presetStyle(preset === 'custom' ? 'color' : preset)), [preset])

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
            ? (custom ?? undefined)
            : selectedSource?.real
              ? // Presets keep src empty and are resolved from /maps/ on every load.
                {
                  src: '',
                  width: selectedSource.width,
                  height: selectedSource.height,
                  real: true,
                }
              : undefined,
          { cayoPerico: cayo },
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
        detail: `${PRESETS.find((p) => p.id === preset)?.name}${cayo ? ` + ${CAYO_PERICO.name}` : ''}`,
        ownerId: user.id,
      } as HistoryEntry)
      navigate(`/editor/${project.id}`)
    } catch (e) {
      toast.error('Could not create project', (e as Error).message)
      setCreating(false)
    }
  }

  return (
    <div className="relative min-h-full">
      <GlassBlobs />
      <div className="relative z-10">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <button onClick={() => navigate(-1)} className="text-ink-400 hover:text-ink-100 mb-4 inline-flex items-center gap-1.5 text-sm transition">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{importMode ? 'Import minimap' : 'New project'}</h1>
          <p className="text-ink-400 mt-1 text-sm">Pick a base map, name your project and jump into the editor.</p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_380px]">
            <div className="space-y-6">
              <label className="block">
                <span className="label">Project name</span>
                <input className="field" placeholder="e.g. My RP map" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>

              <div>
                <span className="label">Start from a preset</span>
                {Object.values(sources).length > 0 && !Object.values(sources).some((s) => s?.real) && (
                  <p className="border-ink-700 bg-ink-850/70 text-ink-400 mb-3 rounded-xl border px-3 py-2 text-xs">
                    Presets are stylized previews. Drop your own GTA V minimap textures (one image or the{' '}
                    <code className="bg-ink-800 text-ink-300 rounded px-1">minimap_sea_*.dds</code> tiles from OpenIV) into{' '}
                    {MAP_PRESET_IDS.map((id, i) => (
                      <span key={id}>
                        <code className="bg-ink-800 text-ink-300 rounded px-1">public/maps/{MAP_FOLDERS[id]}/</code>
                        {i < MAP_PRESET_IDS.length - 1 ? ', ' : ''}
                      </span>
                    ))}{' '}
                    to use the real maps, or import them below.
                  </p>
                )}
                <TextureDiagnostics sources={sources} />
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
                        className={cn('panel relative overflow-hidden text-left transition', active ? 'border-brand-500 shadow-glow' : 'hover:border-ink-500')}
                      >
                        <div className="bg-ink-900 relative aspect-[4/3]">
                          {src ? (
                            <img src={src} alt={p.name} className="h-full w-full object-cover" />
                          ) : p.id === 'custom' ? (
                            <div className="grid-bg text-ink-500 flex h-full w-full flex-col items-center justify-center gap-1">
                              <Upload className="h-6 w-6" />
                              <span className="text-[11px]">Upload</span>
                            </div>
                          ) : (
                            <div className="shimmer h-full w-full" />
                          )}
                          {active && (
                            <span className="bg-brand-500 absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-white">
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

              <div>
                <span className="label">Islands</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={cayo}
                  onClick={() => setCayo((v) => !v)}
                  className={cn('panel flex w-full items-center gap-4 p-3 text-left transition', cayo ? 'border-brand-500 shadow-glow' : 'hover:border-ink-500')}
                >
                  <img src={cayoThumb} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      Include {CAYO_PERICO.name}
                      <span className="border-brand-500/40 bg-brand-500/10 text-brand-300 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">New</span>
                    </p>
                    <p className="text-ink-400 mt-1 text-xs">
                      Adds the heist island south-east of Los Santos. Zones and blips on it export with real coordinates, and the resource loads the island
                      in-game (game build {CAYO_PERICO.minGameBuild}+).
                    </p>
                  </div>
                  <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition', cayo ? 'bg-brand-500' : 'bg-ink-600')}>
                    <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition', cayo ? 'left-4.5' : 'left-0.5')} />
                  </span>
                </button>
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
                    <Loader2 className="text-brand-400 h-7 w-7 animate-spin" />
                  ) : (
                    <div className="bg-ink-800 text-ink-300 flex h-12 w-12 items-center justify-center rounded-xl">
                      <Upload className="h-5 w-5" />
                    </div>
                  )}
                  <p className="mt-3 font-semibold">Drop your minimap files here</p>
                  <p className="text-ink-400 mt-1 text-xs">PNG · JPG · WebP · DDS frames · split tiles · ZIP folders · or click to browse</p>
                  <p className="text-ink-500 mt-3 text-[11px]">
                    Name your tiles <code className="bg-ink-800 text-ink-300 rounded px-1 py-0.5">minimap_sea_0_0</code> …{' '}
                    <code className="bg-ink-800 text-ink-300 rounded px-1 py-0.5">minimap_sea_2_1</code> and they will land on the right spot.
                  </p>
                </div>
                <AnimatePresence>
                  {custom && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-ink-700 bg-ink-850 mt-3 flex items-center gap-3 rounded-xl border px-3 py-2 text-sm"
                    >
                      <FileImage className="text-brand-400 h-4 w-4" />
                      <span className="text-ink-300 flex-1">
                        Custom map ready · {custom.width} × {custom.height}px
                        {custom.tiles > 1 ? ` · ${custom.tiles} tiles` : ''}
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
                <div className="bg-ink-900 relative aspect-[3/4]">
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
                      <motion.div key="empty" className="grid-bg text-ink-500 flex h-full w-full flex-col items-center justify-center gap-2">
                        <Upload className="h-6 w-6" />
                        <span className="text-xs">Upload a map to preview</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="from-ink-950/90 absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-4">
                    <p className="text-ink-400 text-xs">Preview</p>
                    <p className="font-semibold">
                      {PRESETS.find((p) => p.id === preset)?.name}
                      {cayo && <span className="text-brand-300"> + {CAYO_PERICO.name}</span>}
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-ink-400 text-sm">{PRESETS.find((p) => p.id === preset)?.description}</p>
                  <Button className="mt-4 w-full" size="lg" loading={creating} onClick={create}>
                    Create Project
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
