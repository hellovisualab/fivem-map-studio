import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Download,
  Hexagon,
  Image as ImageIcon,
  Layers,
  MapPin,
  MousePointer2,
  Palette,
  Type,
  Upload,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Navbar } from '@/components/layout/Navbar'
import { MapBackdrop } from '@/components/landing/MapBackdrop'
import { PLANS } from '@/lib/constants'
import { useAuth } from '@/store/useAuth'
import { cn } from '@/lib/utils'

const features = [
  { icon: Hexagon, title: 'Zones & territories', text: 'Draw gang, police, safe and custom areas with colors, borders and transparency.' },
  { icon: Type, title: 'Labels & typography', text: 'Name districts and streets with rotatable, styled text layers.' },
  { icon: ImageIcon, title: 'Images & logos', text: 'Drop PNG, JPG or WebP artwork onto the map. Scale, rotate and reorder.' },
  { icon: MapPin, title: 'Markers', text: 'Police, hospital, bank, shop, garage and custom icons mapped to FiveM blips.' },
  { icon: Layers, title: 'Layer system', text: 'Hide, lock, search and reorder every element like a real design tool.' },
  { icon: Download, title: 'One-click export', text: 'Generates fxmanifest.lua, stream/, html/, config/ and JSON positions as a ZIP.' },
]

const tools = [MousePointer2, Type, ImageIcon, Hexagon, MapPin, Palette]

export function Landing() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const go = (path: string) => navigate(user ? path : '/register', { state: { from: path } })

  return (
    <div className="min-h-full">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <MapBackdrop />
        <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-300 uppercase">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" /> New: Live canvas editor
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-ink-100 sm:text-6xl">
              FiveM <span className="bg-gradient-to-r from-brand-300 to-brand-600 bg-clip-text text-transparent">Tools</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-300">
              Create minimaps, props and handling files, and optimize textures — all in the browser. Export drop-in FiveM resources in one click.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => go('/tools')} className="w-full sm:w-auto">
                Open tools <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => go('/new')} className="w-full sm:w-auto">
                <Upload className="h-4 w-4" /> Minimap editor
              </Button>
            </div>
            <div className="mt-10 flex items-center justify-center gap-2">
              {tools.map((Icon, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.06 }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-ink-700 bg-ink-850/80 text-ink-300 backdrop-blur"
                >
                  <Icon className="h-4 w-4" />
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Editor mock */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="panel mx-auto mt-16 max-w-5xl overflow-hidden p-1.5"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
              <span className="ml-3 text-xs text-ink-500">Los Santos RP - minimap.fms</span>
              <span className="ml-auto text-xs text-emerald-400">All changes saved</span>
            </div>
            <div className="grid grid-cols-[48px_1fr] gap-1.5 sm:grid-cols-[56px_1fr_220px]">
              <div className="flex flex-col items-center gap-2 rounded-xl bg-ink-900 py-3">
                {tools.map((Icon, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-ink-400',
                      i === 3 && 'bg-brand-500/15 text-brand-400 ring-1 ring-brand-500/40',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                ))}
              </div>
              <div className="relative h-72 overflow-hidden rounded-xl bg-ink-900 sm:h-96">
                <MapBackdrop preset="color" className="opacity-90" />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9 }}
                  className="absolute top-1/3 left-1/4 h-24 w-40 rounded-md border-2 border-rose-500 bg-rose-500/30"
                >
                  <span className="absolute -top-6 left-0 rounded bg-ink-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">Ballas territory</span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.1 }}
                  className="absolute top-1/2 right-1/4 h-28 w-28 rounded-md border-2 border-blue-500 bg-blue-500/30"
                >
                  <span className="absolute -top-6 left-0 rounded bg-ink-900/90 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">Mission Row PD</span>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 }}
                  className="absolute bottom-10 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg"
                >
                  <MapPin className="h-4 w-4" />
                </motion.div>
              </div>
              <div className="hidden flex-col gap-2 rounded-xl bg-ink-900 p-3 sm:flex">
                <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Layers</p>
                {['Ballas territory', 'Mission Row PD', 'Pillbox Hospital', 'Downtown label'].map((l, i) => (
                  <div key={l} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', i === 0 ? 'bg-brand-500/10 text-brand-300' : 'text-ink-300')}>
                    <span className={cn('h-2 w-2 rounded-sm', ['bg-rose-500', 'bg-blue-500', 'bg-emerald-500', 'bg-ink-300'][i])} />
                    {l}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything a server owner needs</h2>
          <p className="mt-3 text-ink-400">A design tool built for FiveM. No Photoshop, no OpenIV wrestling, no Lua by hand.</p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: i * 0.05 }}
              className="panel group p-5 transition hover:border-brand-500/40"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-400 ring-1 ring-brand-500/20 transition group-hover:bg-brand-500/20">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-400">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Simple plans</h2>
          <p className="mt-3 text-ink-400">Start free. Upgrade when your server grows.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          {(['free', 'supporter'] as const).map((id) => {
            const p = PLANS[id]
            const highlight = id === 'supporter'
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className={cn('panel relative p-6', highlight && 'border-brand-500/50 shadow-glow')}
              >
                {highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-brand-500 px-3 py-0.5 text-[11px] font-bold text-ink-950 uppercase">
                    Most popular
                  </span>
                )}
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <span className="text-2xl font-bold">{p.price}</span>
                </div>
                <p className="mt-1 text-sm text-ink-400">
                  {p.exportsPerDay === null ? 'Unlimited exports' : `${p.exportsPerDay} export per day`}
                </p>
                <ul className="mt-5 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-ink-200">
                      <Check className="h-4 w-4 text-brand-400" /> {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={highlight ? 'primary' : 'outline'}
                  onClick={() => navigate(user ? '/dashboard' : '/register')}
                >
                  {highlight ? (
                    <>
                      <Zap className="h-4 w-4" /> Become a Supporter
                    </>
                  ) : (
                    'Start for free'
                  )}
                </Button>
              </motion.div>
            )
          })}
        </div>
      </section>

      <footer className="border-t border-ink-800 py-8 text-center text-xs text-ink-500">
        <p>
          FiveM Map Studio is a community tool and is not affiliated with Rockstar Games or Cfx.re.{' '}
          <Link to="/register" className="text-brand-400 hover:underline">
            Create an account
          </Link>
        </p>
      </footer>
    </div>
  )
}
