import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Lock } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { GlassBlobs } from '@/components/layout/GlassBlobs'
import { Button } from '@/components/ui/Button'
import { TOOLS, type ToolDef } from '@/lib/tools'
import { useAuth } from '@/store/useAuth'
import { cn } from '@/lib/utils'

function ToolCard({ tool, onOpen }: { tool: ToolDef; onOpen: (tool: ToolDef) => void }) {
  const Icon = tool.icon
  const locked = tool.comingSoon

  return (
    <motion.button
      type="button"
      whileHover={locked ? undefined : { y: -2 }}
      whileTap={locked ? undefined : { scale: 0.99 }}
      onClick={() => onOpen(tool)}
      disabled={locked}
      className={cn(
        'panel group relative flex w-full flex-col gap-4 p-5 text-left transition',
        locked ? 'cursor-not-allowed opacity-70' : 'hover:border-brand-500/50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="bg-brand-500/15 text-brand-400 ring-brand-500/30 flex h-11 w-11 items-center justify-center rounded-xl ring-1">
          <Icon className="h-5 w-5" />
        </div>
        {locked ? (
          <span className="border-ink-600 bg-ink-800 text-ink-400 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
            <Lock className="h-3 w-3" /> Coming soon
          </span>
        ) : (
          <span className="bg-brand-500/10 text-brand-400 flex h-8 w-8 items-center justify-center rounded-lg opacity-0 transition group-hover:opacity-100">
            <ArrowRight className="h-4 w-4" />
          </span>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-ink-100 text-lg font-semibold">{tool.name}</h3>
          {tool.badge && !locked && (
            <span className="border-brand-500/40 bg-brand-500/10 text-brand-300 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase">
              {tool.badge}
            </span>
          )}
        </div>
        <p className="text-ink-400 mt-2 text-sm leading-relaxed">{tool.description}</p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 text-[11px] font-medium">
        <span className="border-ink-700 bg-ink-900 text-ink-400 rounded-md border px-2 py-1">{tool.freeLimit}</span>
        <span className="border-brand-500/30 bg-brand-500/10 text-brand-300 rounded-md border px-2 py-1">{tool.supporterLimit}</span>
      </div>
    </motion.button>
  )
}

export function ToolsHub() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)

  const open = (tool: ToolDef) => {
    if (tool.comingSoon || !tool.href) return
    if (!user) {
      navigate('/register', { state: { from: tool.href } })
      return
    }
    navigate(tool.href)
  }

  const creation = TOOLS.filter((t) => t.section === 'creation')
  const optimization = TOOLS.filter((t) => t.section === 'optimization')

  return (
    <div className="relative min-h-full">
      <GlassBlobs />
      <div className="relative z-10">
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-brand-400 text-xs font-semibold tracking-wider uppercase">FiveM Tools</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Create and optimize assets in the browser</h1>
            <p className="text-ink-400 mt-3">
              Minimap, props, handling and texture tools in one place. Free accounts get 1 export per day across all tools; Supporters get unlimited.
            </p>
            {!user && (
              <div className="mt-5 flex gap-2">
                <Button onClick={() => navigate('/register')}>Get started</Button>
                <Button variant="outline" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
              </div>
            )}
          </div>

          <section className="mt-12">
            <h2 className="text-ink-400 text-sm font-semibold tracking-wider uppercase">Creation tools</h2>
            <p className="text-ink-500 mt-1 text-sm">Build minimaps, props and handling files without leaving the browser.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {creation.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onOpen={open} />
              ))}
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-ink-400 text-sm font-semibold tracking-wider uppercase">Optimization tools</h2>
            <p className="text-ink-500 mt-1 text-sm">Shrink texture packs before they hit your server.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {optimization.map((tool) => (
                <ToolCard key={tool.id} tool={tool} onOpen={open} />
              ))}
            </div>
          </section>

          <p className="text-ink-500 mt-10 text-center text-xs">
            Looking for your minimap projects?{' '}
            <Link to={user ? '/dashboard' : '/login'} className="text-brand-400 hover:underline">
              Open Minimap dashboard
            </Link>
          </p>
        </main>
      </div>
    </div>
  )
}
