import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useEditor } from '@/store/useEditor'
import { getData } from '@/lib/data'
import { renderDocument } from '@/lib/render'
import { toast } from '@/components/ui/Toast'
import { LogoMark } from '@/components/ui/Logo'
import { MapCanvas } from '@/components/editor/MapCanvas'
import { Toolbar } from '@/components/editor/Toolbar'
import { LayersPanel } from '@/components/editor/LayersPanel'
import { PropertiesPanel } from '@/components/editor/PropertiesPanel'
import { SidePanel, SideTabs } from '@/components/editor/SidePanel'
import { TopBar } from '@/components/editor/TopBar'
import { StatusBar } from '@/components/editor/StatusBar'
import { ExportDialog } from '@/components/editor/ExportDialog'
import { ImportDialog } from '@/components/editor/ImportDialog'
import { ShortcutsDialog } from '@/components/editor/ShortcutsDialog'
import { useShortcuts } from '@/hooks/useShortcuts'

export function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const project = useEditor((s) => s.project)
  const sidePanel = useEditor((s) => s.sidePanel)
  const sideTab = useEditor((s) => s.sideTab)
  const saveState = useEditor((s) => s.saveState)
  const selectedCount = useEditor((s) => s.selectedIds.length)
  const [loading, setLoading] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileSheet, setMobileSheet] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!id) return
      const p = await getData().getProject(id)
      if (!alive) return
      if (!p) {
        toast.error('Project not found')
        navigate('/dashboard', { replace: true })
        return
      }
      const store = useEditor.getState()
      store.loadProject(p)
      store.setThumbnailProvider(async () => {
        const d = useEditor.getState().doc
        if (!d) return undefined
        const c = await renderDocument(d, { maxWidth: 360 })
        return c.toDataURL('image/jpeg', 0.7)
      })
      setLoading(false)
    })()
    return () => {
      alive = false
      const s = useEditor.getState()
      if (s.saveState === 'unsaved') void s.save()
      s.unload()
    }
  }, [id, navigate])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().saveState === 'unsaved' || useEditor.getState().saveState === 'saving') {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Auto-open the design sheet on mobile when something gets selected.
  useEffect(() => {
    if (selectedCount > 0 && window.innerWidth < 768 && !mobileSheet) {
      useEditor.getState().setSideTab('design')
      setMobileSheet(true)
    }
  }, [selectedCount, mobileSheet])

  const shortcutOpts = useMemo(() => ({ onExport: () => setExportOpen(true), onHelp: () => setHelpOpen((v) => !v) }), [])
  useShortcuts(shortcutOpts)

  const docSize = useMemo(() => (project ? JSON.stringify(project.document).length : 0), [project])

  if (loading || !project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-ink-950">
        <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
          <LogoMark className="h-12 w-12" />
        </motion.div>
        <p className="text-sm text-ink-400">Loading project…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-ink-950">
      <TopBar onExport={() => setExportOpen(true)} onImport={() => setImportOpen(true)} docSize={docSize} />

      <div className="relative flex min-h-0 flex-1">
        {/* Desktop toolbar */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }} className="absolute top-3 left-3 z-20 hidden md:block">
          <Toolbar />
        </motion.div>

        {/* Canvas */}
        <div className="relative min-w-0 flex-1">
          <MapCanvas />
          {/* Mobile toolbar */}
          <div className="absolute inset-x-2 top-2 z-20 md:hidden">
            <Toolbar orientation="horizontal" />
          </div>
        </div>

        {/* Desktop side panel */}
        <AnimatePresence initial={false}>
          {sidePanel && (
            <motion.aside
              key="side"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 316, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="hidden shrink-0 overflow-hidden border-l border-ink-800 bg-ink-900/60 p-2 md:flex"
            >
              <div className="h-full w-[300px]">
                <SidePanel />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <StatusBar onHelp={() => setHelpOpen(true)} />

      {/* Mobile bottom sheet */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 border-t border-ink-800 bg-ink-900 px-2 py-1.5">
          <SideTabs className="flex-1" />
          <button
            onClick={() => setMobileSheet((v) => !v)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-300 hover:bg-ink-800"
            aria-expanded={mobileSheet}
          >
            {mobileSheet ? 'Hide' : 'Show'}
          </button>
        </div>
        <AnimatePresence>
          {mobileSheet && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: '46vh' }}
              exit={{ height: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 34 }}
              className="overflow-hidden border-t border-ink-800 bg-ink-850"
            >
              <div className="h-[46vh]">{sideTab === 'layers' ? <LayersPanel embedded /> : <PropertiesPanel />}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      {saveState === 'error' && (
        <div className="pointer-events-none absolute right-4 bottom-12 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          Autosave failed - press Ctrl+S to retry.
        </div>
      )}
    </div>
  )
}
