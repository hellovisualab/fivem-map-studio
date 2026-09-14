import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, FileArchive, FolderTree, Lock, Zap } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { useEditor } from '@/store/useEditor'
import { useAuth } from '@/store/useAuth'
import { exportFiveMResource, buildPositions } from '@/lib/exporter'
import { getData } from '@/lib/data'
import { downloadBlob, slugify, uid } from '@/lib/utils'
import type { HistoryEntry } from '@/types'

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useEditor((s) => s.project)
  const doc = useEditor((s) => s.doc)
  const user = useAuth((s) => s.user)
  const remaining = useAuth((s) => s.exportsRemaining())
  const { recordExport } = useAuth.getState()
  const navigate = useNavigate()

  const [resourceName, setResourceName] = useState('')
  const [includeTextures, setIncludeTextures] = useState(true)
  const [splitTiles, setSplitTiles] = useState(true)
  const [includeHtml, setIncludeHtml] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null)

  useEffect(() => {
    if (project) setResourceName(slugify(`${project.name}_minimap`))
  }, [project])

  if (!project || !doc) return null
  const stats = buildPositions(doc)
  const locked = remaining !== null && remaining <= 0

  const run = async () => {
    if (locked) return
    setBusy(true)
    setProgress({ pct: 0, label: 'Starting' })
    try {
      await useEditor.getState().save()
      const blob = await exportFiveMResource(
        { ...project, document: doc },
        {
          resourceName,
          includeTextures,
          splitTiles,
          includeHtml,
          tileColumns: 3,
          tileRows: 4,
          onProgress: (pct, label) => setProgress({ pct, label }),
        },
      )
      downloadBlob(blob, `${slugify(resourceName)}.zip`)
      await recordExport()
      if (user) {
        await getData().addHistory({
          id: uid(),
          projectId: project.id,
          projectName: project.name,
          action: 'exported',
          at: new Date().toISOString(),
          detail: `${(blob.size / 1024 / 1024).toFixed(1)} MB`,
          ownerId: user.id,
        } as HistoryEntry)
      }
      toast.success('Resource exported', 'Drop the folder into resources/ and ensure it in server.cfg.')
      onClose()
    } catch (e) {
      toast.error('Export failed', (e as Error).message)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="Export FiveM Resource" description="Generates a drop-in resource folder as a ZIP." size="md">
      {/* Summary strip */}
      <div className="mb-4 grid grid-cols-5 gap-2">
        {[
          ['Zones', stats.zones.length],
          ['Markers', stats.markers.length],
          ['Labels', stats.labels.length],
          ['Lines', stats.lines.length],
          ['Texture', `${doc.baseMap.width}×${doc.baseMap.height}`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-ink-700 bg-ink-900/60 px-2 py-2 text-center">
            <p className="text-[10px] font-semibold tracking-wider text-ink-500 uppercase">{label}</p>
            <p className="mt-0.5 truncate font-mono text-sm text-ink-100">{value}</p>
          </div>
        ))}
      </div>

      {locked && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3">
          <Lock className="h-4 w-4 shrink-0 text-red-300" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-red-200">Daily export limit reached</p>
            <p className="text-xs text-red-300/80">Free accounts can export once per day. Upgrade to Supporter for unlimited exports.</p>
          </div>
          <Button size="sm" onClick={() => navigate('/dashboard')}>
            <Zap className="h-3.5 w-3.5" /> Upgrade
          </Button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="min-w-0 space-y-4">
          <label className="block">
            <span className="label">Resource name</span>
            <input className="field font-mono" value={resourceName} onChange={(e) => setResourceName(slugify(e.target.value) || e.target.value)} />
          </label>

          <div className="space-y-2">
            <span className="label">Contents</span>
            {[
              { k: 'textures', label: 'Minimap textures (stream/)', desc: 'Full PNG render of your map', v: includeTextures, set: setIncludeTextures },
              { k: 'tiles', label: 'Split into 3×4 tiles', desc: 'minimap_sea_X_Y.png, ready for minimap.ytd', v: splitTiles && includeTextures, set: setSplitTiles, disabled: !includeTextures },
              { k: 'html', label: 'NUI overlay (html/)', desc: 'Toggle with /minimapoverlay in-game', v: includeHtml, set: setIncludeHtml },
            ].map((o) => (
              <label key={o.k} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${o.v ? 'border-brand-500/40 bg-brand-500/5' : 'border-ink-700 hover:border-ink-500'} ${o.disabled ? 'opacity-50' : ''}`}>
                <input type="checkbox" className="mt-0.5 accent-brand-500" checked={o.v} disabled={o.disabled} onChange={(e) => o.set(e.target.checked)} />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-xs text-ink-400">{o.desc}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-xs text-ink-400">
            <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-ink-300">
              <FolderTree className="h-3.5 w-3.5" /> {slugify(resourceName) || 'resource'}/
            </p>
            <pre className="scrollbar-thin overflow-x-auto font-mono leading-5 text-ink-500">
              {`├─ fxmanifest.lua
├─ client.lua · server.lua
├─ config/ config.lua · zones.json · markers.json · labels.json · positions.json
${includeTextures ? `├─ stream/ minimap_full.png${splitTiles ? ' · minimap_sea_0_0…2_3.png' : ''}\n` : ''}${includeHtml ? '└─ html/ index.html · overlay.png' : '└─ README.md'}`}
            </pre>
          </div>
        </div>

        <aside className="space-y-3">
          <div className={`rounded-xl border p-3 text-xs ${locked ? 'border-red-500/30 bg-red-500/5' : 'border-ink-700 bg-ink-900/60'}`}>
            <p className="label">Your plan</p>
            {remaining === null ? (
              <p className="flex items-center gap-1.5 text-brand-300">
                <Zap className="h-3.5 w-3.5" /> Unlimited exports
              </p>
            ) : (
              <p className={locked ? 'text-red-300' : 'text-ink-300'}>
                {remaining} export{remaining === 1 ? '' : 's'} left today
              </p>
            )}
          </div>
          <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-xs text-ink-400">
            <p className="label">What you get</p>
            <ul className="space-y-1">
              <li>fxmanifest.lua + client/server Lua</li>
              <li>Zones &amp; blips in GTA coordinates</li>
              <li>JSON positions for other tools</li>
              <li>PNG textures ready for minimap.ytd</li>
            </ul>
          </div>
        </aside>
      </div>

      {progress && (
        <div className="mt-5">
          <div className="flex justify-between text-xs text-ink-400">
            <span>{progress.label}</span>
            <span>{progress.pct}%</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
            <motion.div className="h-full rounded-full bg-brand-500" animate={{ width: `${progress.pct}%` }} transition={{ ease: 'easeOut' }} />
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs text-ink-500">
          <FileArchive className="h-3.5 w-3.5" /> ZIP download
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={run} loading={busy} disabled={locked} variant={locked ? 'secondary' : 'primary'}>
            {locked ? (
              <>
                <Lock className="h-4 w-4" /> Limit reached
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Export FiveM Resource
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
