import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, Download, Hexagon, Image as ImageIcon, Layers, MapPin, MousePointer2, Palette, Type, Upload, Zap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Navbar } from '@/components/layout/Navbar'
import { GlassBlobs } from '@/components/layout/GlassBlobs'
import { MapBackdrop } from '@/components/landing/MapBackdrop'
import { LOGO_SRC } from '@/components/ui/Logo'
import { PLANS } from '@/lib/constants'
import { useAuth } from '@/store/useAuth'
import { cn } from '@/lib/utils'

const features = [
  {
    icon: Hexagon,
    title: 'Zones & territories',
    text: 'Draw gang, police, safe and custom areas with colors, borders and transparency.',
  },
  {
    icon: Type,
    title: 'Labels & typography',
    text: 'Name districts and streets with rotatable, styled text layers.',
  },
  {
    icon: ImageIcon,
    title: 'Images & logos',
    text: 'Drop PNG, JPG or WebP artwork onto the map. Scale, rotate and reorder.',
  },
  {
    icon: MapPin,
    title: 'Markers',
    text: 'Police, hospital, bank, shop, garage and custom icons mapped to FiveM blips.',
  },
  {
    icon: Layers,
    title: 'Layer system',
    text: 'Hide, lock, search and reorder every element like a real design tool.',
  },
  {
    icon: Download,
    title: 'One-click export',
    text: 'Generates fxmanifest.lua, stream/, html/, config/ and JSON positions as a ZIP.',
  },
]

const tools = [MousePointer2, Type, ImageIcon, Hexagon, MapPin, Palette]

export function Landing() {
  const navigate = useNavigate()
  const user = useAuth((s) => s.user)
  const go = (path: string) => navigate(user ? path : '/register', { state: { from: path } })

  return (
    <div className="relative min-h-full">
      <GlassBlobs />
      <div className="relative z-10">
        <Navbar />

        {/* Hero */}
        <section className="relative overflow-hidden">
          <MapBackdrop />
          <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[480px]" />
          <div className="relative mx-auto max-w-7xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mx-auto max-w-3xl text-center">
              <span className="border-brand-500/40 bg-brand-500/10 text-brand-300 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-medium backdrop-blur-md">
                <span className="bg-brand-400 h-1.5 w-1.5 animate-pulse rounded-full" /> LABSEVE7 · Tools for FiveM servers
              </span>
              <h1 className="text-ink-100 mt-6 text-4xl leading-[1.05] font-extrabold tracking-tight uppercase sm:text-6xl lg:text-7xl">
                Premium tools
                <br />
                <span className="text-brand-500">for FiveM</span>
              </h1>
              <p className="text-ink-300 mx-auto mt-6 max-w-2xl text-base sm:text-lg">
                Create minimaps, props and handling files, and optimize textures — all in the browser. Export drop-in FiveM resources in one click.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button size="lg" onClick={() => go('/tools')} className="w-full rounded-full px-7 sm:w-auto">
                  Open tools <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => go('/new')} className="w-full rounded-full px-7 sm:w-auto">
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
                    className="text-ink-300 flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-md"
                  >
                    <Icon className="h-4 w-4" />
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="panel mx-auto mt-12 grid max-w-2xl grid-cols-2 gap-y-5 px-6 py-5 text-center sm:grid-cols-4"
            >
              {[
                ['4', 'Tools'],
                ['FiveM', 'Ready export'],
                ['4K', 'Textures'],
                ['0', 'Lines of Lua'],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="text-ink-100 text-2xl font-extrabold tracking-tight">{v}</p>
                  <p className="text-ink-400 mt-0.5 text-[11px] font-medium tracking-wider uppercase">{l}</p>
                </div>
              ))}
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
                <span className="text-ink-500 ml-3 text-xs">Los Santos RP - minimap.fms</span>
                <span className="ml-auto text-xs text-emerald-400">All changes saved</span>
              </div>
              <div className="grid grid-cols-[48px_1fr] gap-1.5 sm:grid-cols-[56px_1fr_220px]">
                <div className="bg-ink-900 flex flex-col items-center gap-2 rounded-xl py-3">
                  {tools.map((Icon, i) => (
                    <div
                      key={i}
                      className={cn(
                        'text-ink-400 flex h-8 w-8 items-center justify-center rounded-lg',
                        i === 3 && 'bg-brand-500/15 text-brand-400 ring-brand-500/40 ring-1',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  ))}
                </div>
                <div className="bg-ink-900 relative h-72 overflow-hidden rounded-xl sm:h-96">
                  <MapBackdrop preset="color" className="opacity-90" />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.9 }}
                    className="absolute top-1/3 left-1/4 h-24 w-40 rounded-md border-2 border-rose-500 bg-rose-500/30"
                  >
                    <span className="bg-ink-900/90 absolute -top-6 left-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">Ballas territory</span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.1 }}
                    className="absolute top-1/2 right-1/4 h-28 w-28 rounded-md border-2 border-blue-500 bg-blue-500/30"
                  >
                    <span className="bg-ink-900/90 absolute -top-6 left-0 rounded px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">Mission Row PD</span>
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
                <div className="bg-ink-900 hidden flex-col gap-2 rounded-xl p-3 sm:flex">
                  <p className="text-ink-500 text-[11px] font-semibold tracking-wider uppercase">Layers</p>
                  {['Ballas territory', 'Mission Row PD', 'Pillbox Hospital', 'Downtown label'].map((l, i) => (
                    <div
                      key={l}
                      className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', i === 0 ? 'bg-brand-500/10 text-brand-300' : 'text-ink-300')}
                    >
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
            <p className="text-brand-400 text-xs font-semibold tracking-[0.2em] uppercase">All included</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Everything your server <span className="text-brand-500">needs</span>
            </h2>
            <p className="text-ink-400 mt-3">A design tool built for FiveM. No Photoshop, no OpenIV wrestling, no Lua by hand.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: i * 0.05 }}
                className="panel panel-hover group p-5"
              >
                <div className="bg-brand-500/10 text-brand-400 ring-brand-500/20 group-hover:bg-brand-500/20 flex h-10 w-10 items-center justify-center rounded-xl ring-1 transition">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="text-ink-400 mt-1.5 text-sm">{f.text}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-brand-400 text-xs font-semibold tracking-[0.2em] uppercase">Pricing</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
              Simple <span className="text-brand-500">plans</span>
            </h2>
            <p className="text-ink-400 mt-3">Start free. Upgrade when your server grows.</p>
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
                    <span className="bg-brand-500 absolute -top-3 left-6 rounded-full px-3 py-0.5 text-[11px] font-bold text-white uppercase shadow-[0_0_12px_rgba(236,72,153,0.5)]">
                      Most popular
                    </span>
                  )}
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    <span className="text-2xl font-bold">{p.price}</span>
                  </div>
                  <p className="text-ink-400 mt-1 text-sm">{p.exportsPerDay === null ? 'Unlimited exports' : `${p.exportsPerDay} export per day`}</p>
                  <ul className="mt-5 space-y-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="text-ink-200 flex items-center gap-2 text-sm">
                        <Check className="text-brand-400 h-4 w-4" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" variant={highlight ? 'primary' : 'outline'} onClick={() => navigate(user ? '/dashboard' : '/register')}>
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

        <footer className="border-t border-white/[0.06] py-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-between sm:text-left">
            <div className="flex items-center gap-3">
              <img src={LOGO_SRC} alt="LABSEVE7" className="h-6 w-auto" />
              <span className="text-ink-500 text-xs">Tools</span>
            </div>
            <p className="text-ink-500 text-xs">
              Not affiliated with Rockstar Games or Cfx.re.{' '}
              <a href="https://labseve7.com" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">
                labseve7.com
              </a>{' '}
              ·{' '}
              <Link to="/register" className="text-brand-400 hover:underline">
                Create an account
              </Link>
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
