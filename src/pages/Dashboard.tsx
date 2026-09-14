import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Clock, Copy, Download, FolderOpen, MoreHorizontal, Plus, Sparkles, Trash2, Upload, Zap } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { useAuth } from '@/store/useAuth'
import { getData } from '@/lib/data'
import { PLANS, PRESETS } from '@/lib/constants'
import { formatBytes, formatRelative, uid } from '@/lib/utils'
import type { HistoryEntry, ProjectSummary } from '@/types'

const actionLabel: Record<HistoryEntry['action'], string> = {
  created: 'Created',
  exported: 'Exported',
  imported: 'Imported',
  renamed: 'Renamed',
  deleted: 'Deleted',
  duplicated: 'Duplicated',
}

export function Dashboard() {
  const { user, setPlan, exportsRemaining } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ProjectSummary | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const userId = user?.id
  const load = useCallback(async () => {
    if (!userId) return
    const data = getData()
    const [p, h] = await Promise.all([data.listProjects(userId), data.listHistory(userId)])
    setProjects(p)
    setHistory(h)
    const used = p.reduce((sum, x) => sum + x.sizeBytes, 0)
    if (used !== useAuth.getState().user?.storageUsed) void useAuth.getState().updateProfile({ storageUsed: used })
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const remaining = exportsRemaining()

  const duplicate = async (p: ProjectSummary) => {
    if (!user) return
    const data = getData()
    const full = await data.getProject(p.id)
    if (!full) return
    const now = new Date().toISOString()
    const copy = { ...full, id: uid(12), name: `${full.name} copy`, createdAt: now, updatedAt: now }
    await data.createProject(copy)
    await data.addHistory({ id: uid(), projectId: copy.id, projectName: copy.name, action: 'duplicated', at: now, ownerId: user.id } as HistoryEntry)
    toast.success('Project duplicated')
    setMenuFor(null)
    void load()
  }

  const remove = async () => {
    if (!user || !confirmDelete) return
    const data = getData()
    await data.deleteProject(confirmDelete.id)
    await data.addHistory({
      id: uid(),
      projectId: confirmDelete.id,
      projectName: confirmDelete.name,
      action: 'deleted',
      at: new Date().toISOString(),
      ownerId: user.id,
    } as HistoryEntry)
    setConfirmDelete(null)
    toast.success('Project deleted')
    void load()
  }

  if (!user) return null
  const plan = PLANS[user.plan]

  return (
    <div className="min-h-full">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-ink-400">Welcome back,</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{user.displayName}</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/import')}>
              <Upload className="h-4 w-4" /> Import minimap
            </Button>
            <Button onClick={() => navigate('/new')}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Projects */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wider text-ink-400 uppercase">
                <FolderOpen className="h-4 w-4" /> Projects
              </h2>
              {projects && <span className="text-xs text-ink-500">{projects.length} total</span>}
            </div>

            {projects === null ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="shimmer h-56 rounded-2xl" />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20">
                  <Plus className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-semibold">No projects yet</h3>
                <p className="mt-1 max-w-sm text-sm text-ink-400">Create your first minimap from a preset or import your existing tiles.</p>
                <Button className="mt-5" onClick={() => navigate('/new')}>
                  Create project
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence>
                  {projects.map((p, i) => (
                    <motion.div
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ delay: i * 0.03 }}
                      className="panel group relative overflow-hidden transition hover:border-brand-500/40"
                    >
                      <Link to={`/editor/${p.id}`} className="block">
                        <div className="relative aspect-[4/3] overflow-hidden bg-ink-900">
                          {p.thumbnail ? (
                            <img src={p.thumbnail} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                          ) : (
                            <div className="grid-bg flex h-full w-full items-center justify-center text-ink-600">
                              <FolderOpen className="h-8 w-8" />
                            </div>
                          )}
                          <span className="absolute top-2 left-2 rounded-md bg-ink-950/80 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-ink-300 uppercase backdrop-blur">
                            {PRESETS.find((x) => x.id === p.preset)?.name ?? p.preset}
                          </span>
                        </div>
                        <div className="px-4 py-3">
                          <h3 className="truncate font-semibold">{p.name}</h3>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {p.elementCount} element{p.elementCount === 1 ? '' : 's'} · edited {formatRelative(p.updatedAt)}
                          </p>
                        </div>
                      </Link>
                      <button
                        onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                        className="absolute top-2 right-2 rounded-lg bg-ink-950/80 p-1.5 text-ink-300 backdrop-blur transition hover:text-ink-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      <AnimatePresence>
                        {menuFor === p.id && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="panel absolute top-11 right-2 z-10 w-40 p-1 text-sm"
                          >
                            <button onClick={() => duplicate(p)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-ink-700">
                              <Copy className="h-4 w-4" /> Duplicate
                            </button>
                            <button
                              onClick={() => {
                                setConfirmDelete(p)
                                setMenuFor(null)
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-red-300 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="panel p-5">
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4 text-brand-400" /> {plan.name} plan
                </h3>
                <span className="text-xs text-ink-500">{plan.price}</span>
              </div>
              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <div className="flex justify-between text-xs text-ink-400">
                    <span>Exports today</span>
                    <span>{remaining === null ? 'Unlimited' : `${remaining} left`}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all"
                      style={{ width: remaining === null ? '100%' : `${((plan.exportsPerDay! - remaining) / plan.exportsPerDay!) * 100}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-ink-400">
                    <span>Storage</span>
                    <span>
                      {formatBytes(user.storageUsed)} / {formatBytes(plan.storageBytes)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                    <div className="h-full rounded-full bg-ink-300" style={{ width: `${Math.min(100, (user.storageUsed / plan.storageBytes) * 100)}%` }} />
                  </div>
                </div>
              </div>
              {user.plan === 'free' ? (
                <Button className="mt-5 w-full" onClick={() => setUpgradeOpen(true)}>
                  <Zap className="h-4 w-4" /> Upgrade to Supporter
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="mt-5 w-full"
                  onClick={async () => {
                    await setPlan('free')
                    toast.info('Switched to Free plan')
                  }}
                >
                  Manage subscription
                </Button>
              )}
            </div>

            <div className="panel p-5">
              <h3 className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4 text-ink-400" /> History
              </h3>
              {history.length === 0 ? (
                <p className="mt-3 text-sm text-ink-500">Your activity will show up here.</p>
              ) : (
                <ul className="scrollbar-thin mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                  {history.slice(0, 30).map((h) => (
                    <li key={h.id} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      <div className="min-w-0">
                        <p className="truncate">
                          <span className="text-ink-400">{actionLabel[h.action]}</span> <span className="font-medium">{h.projectName}</span>
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {formatRelative(h.at)}
                          {h.detail ? ` · ${h.detail}` : ''}
                        </p>
                      </div>
                      {h.action === 'exported' && <Download className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-500" />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Delete project?" size="sm">
        <p className="text-sm text-ink-300">
          <span className="font-semibold text-ink-100">{confirmDelete?.name}</span> will be permanently removed. This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove}>
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </Modal>

      <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="Become a Supporter" description="Unlimited exports and 4K tiles for your server." size="sm">
        <ul className="space-y-2 text-sm">
          {PLANS.supporter.features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-ink-200">
              <Zap className="h-3.5 w-3.5 text-brand-400" /> {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs text-ink-400">
          Payments are not wired up in this build. Activating the plan below simulates a successful checkout so you can test the full flow.
        </p>
        <Button
          className="mt-4 w-full"
          onClick={async () => {
            await setPlan('supporter')
            setUpgradeOpen(false)
            toast.success('Welcome, Supporter!', 'Unlimited exports unlocked.')
          }}
        >
          Activate Supporter · {PLANS.supporter.price}
        </Button>
      </Modal>
    </div>
  )
}
