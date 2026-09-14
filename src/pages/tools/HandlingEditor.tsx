import { useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { Copy, Upload } from 'lucide-react'
import { ToolShell } from '@/components/tools/ToolShell'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import {
  DEFAULT_HANDLING,
  STYLE_OPTIONS,
  VEHICLE_PRESETS,
  applyDrivetrain,
  applyStyle,
  drivetrainOf,
  estimateStats,
  parseHandling,
  scaleField,
  serializeHandling,
  type Drivetrain,
  type HandlingData,
  type HandlingStyle,
} from '@/lib/handling'
import { gateToolExport } from '@/lib/toolExport'
import { cn, downloadBlob, slugify, uid } from '@/lib/utils'

export function HandlingEditor() {
  const [handling, setHandling] = useState<HandlingData>({ ...DEFAULT_HANDLING })
  const [baseline] = useState(() => ({ ...DEFAULT_HANDLING }))
  const [presetName, setPresetName] = useState('Untitled Preset')
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic')
  const [style, setStyle] = useState<HandlingStyle | null>(null)
  const [busy, setBusy] = useState(false)
  const [sliders, setSliders] = useState({ speed: 100, grip: 100, brakes: 100, weight: 100 })
  const fileRef = useRef<HTMLInputElement>(null)

  const stats = useMemo(() => estimateStats(handling), [handling])
  const drive = drivetrainOf(handling)
  const tryCode = useMemo(() => uid(5).toUpperCase(), [])

  const setDrive = (d: Drivetrain) => setHandling((h) => applyDrivetrain(h, d))

  const applySliders = (next: typeof sliders) => {
    setSliders(next)
    setHandling((h) => ({
      ...h,
      fInitialDriveMaxFlatVel: scaleField(baseline.fInitialDriveMaxFlatVel, next.speed),
      fInitialDriveForce: scaleField(baseline.fInitialDriveForce, next.speed),
      fTractionCurveMax: scaleField(baseline.fTractionCurveMax, next.grip),
      fTractionCurveMin: scaleField(baseline.fTractionCurveMin, next.grip),
      fBrakeForce: scaleField(baseline.fBrakeForce, next.brakes),
      fMass: scaleField(baseline.fMass, next.weight),
    }))
  }

  const loadFile = async (file: File) => {
    const text = await file.text()
    try {
      const parsed = parseHandling(text)
      setHandling(parsed)
      setPresetName(`${parsed.handlingName} Preset`)
      toast.success('Handling loaded', parsed.handlingName)
    } catch (e) {
      toast.error('Could not parse handling.meta', (e as Error).message)
    }
  }

  const exportZip = async () => {
    setBusy(true)
    try {
      if (!(await gateToolExport('Handling Editor'))) return
      const xml = serializeHandling(handling)
      const zip = new JSZip()
      const folder = `handling_${slugify(handling.handlingName)}`
      zip.file(`${folder}/handling.meta`, xml)
      zip.file(
        `${folder}/fxmanifest.lua`,
        `fx_version 'cerulean'\ngame 'gta5'\n\nname '${handling.handlingName} handling'\nauthor 'FiveM Tools'\n\nfiles {\n  'handling.meta'\n}\n\ndata_file 'HANDLING_FILE' 'handling.meta'\n`,
      )
      zip.file(`${folder}/README.md`, `# ${handling.handlingName} handling\n\nDrop this folder into your server resources and ensure it.\n`)
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${slugify(handling.handlingName)}_handling.zip`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="Handling Editor" subtitle={presetName} onExport={() => void exportZip()} exportLoading={busy}>
      <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[1fr_320px] lg:p-6">
        <div className="space-y-5">
          <label className="block">
            <span className="label">Vehicle name</span>
            <input
              className="field"
              value={handling.handlingName}
              onChange={(e) => {
                const v = e.target.value
                setHandling((h) => ({ ...h, handlingName: v }))
                setPresetName(`${v || 'Untitled'} Preset`)
              }}
            />
          </label>

          <div>
            <span className="label">Base handling</span>
            <div className="flex flex-wrap gap-2">
              <input
                className="field max-w-xs"
                list="vehicle-presets"
                placeholder="Search GTA V vehicle…"
                onChange={(e) => {
                  const p = VEHICLE_PRESETS.find((x) => x.id === e.target.value || x.name.toLowerCase() === e.target.value.toLowerCase())
                  if (p) {
                    setHandling((h) => ({ ...h, ...p.patch }))
                    setPresetName(`${p.name} Preset`)
                  }
                }}
              />
              <datalist id="vehicle-presets">
                {VEHICLE_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </datalist>
              <Button variant="outline" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" /> Load from file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".meta,.xml,text/xml"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])}
              />
            </div>
          </div>

          <div>
            <span className="label">Drivetrain</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['fwd', 'Front Wheel Drive'],
                  ['awd', 'All Wheel Drive'],
                  ['rwd', 'Rear Wheel Drive'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDrive(id)}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-sm font-medium transition',
                    drive === id ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-ink-700 bg-ink-900 text-ink-300 hover:border-ink-500',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label">Style override</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STYLE_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setStyle(s.id)
                    setHandling((h) => applyStyle(h, s.id))
                  }}
                  className={cn(
                    'rounded-xl border px-3 py-3 text-left transition',
                    style === s.id ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-900 hover:border-ink-500',
                  )}
                >
                  <p className="text-sm font-semibold text-ink-100">{s.label}</p>
                  <p className="text-[11px] text-ink-500">{s.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Tuning</span>
              <div className="flex rounded-lg border border-ink-700 p-0.5 text-xs">
                <button
                  type="button"
                  className={cn('rounded-md px-2.5 py-1', mode === 'basic' ? 'bg-brand-500/20 text-brand-300' : 'text-ink-400')}
                  onClick={() => setMode('basic')}
                >
                  Basic
                </button>
                <button
                  type="button"
                  className={cn('rounded-md px-2.5 py-1', mode === 'advanced' ? 'bg-brand-500/20 text-brand-300' : 'text-ink-400')}
                  onClick={() => setMode('advanced')}
                >
                  Advanced
                </button>
              </div>
            </div>

            {mode === 'basic' ? (
              <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900/50 p-4">
                {(
                  [
                    ['speed', 'Speed'],
                    ['grip', 'Grip'],
                    ['brakes', 'Brakes'],
                    ['weight', 'Weight'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <div className="mb-1 flex justify-between text-xs text-ink-400">
                      <span>{label}</span>
                      <span>{sliders[key]}%</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={150}
                      value={sliders[key]}
                      onChange={(e) => applySliders({ ...sliders, [key]: Number(e.target.value) })}
                      className="w-full"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 rounded-2xl border border-ink-700 bg-ink-900/50 p-4 sm:grid-cols-2">
                {(
                  [
                    ['fInitialDriveForce', 'Drive force'],
                    ['fInitialDriveMaxFlatVel', 'Max flat vel'],
                    ['fBrakeForce', 'Brake force'],
                    ['fTractionCurveMax', 'Traction max'],
                    ['fTractionCurveMin', 'Traction min'],
                    ['fSteeringLock', 'Steering lock'],
                    ['fMass', 'Mass'],
                    ['fSuspensionForce', 'Suspension'],
                    ['fHandBrakeForce', 'Handbrake'],
                    ['nInitialDriveGears', 'Gears'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="label">{label}</span>
                    <input
                      className="field field-sm"
                      type="number"
                      step="any"
                      value={handling[key]}
                      onChange={(e) =>
                        setHandling((h) => ({
                          ...h,
                          [key]: key === 'nInitialDriveGears' ? Math.round(Number(e.target.value)) : Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel p-4">
            <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Estimated in-game stats</p>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ['Speed', `~${stats.speedMph} MPH`],
                ['Mass', `${stats.massKg} kg`],
                ['Grip', String(stats.grip)],
                ['Brakes', String(stats.brakes)],
                ['Gears', String(stats.gears)],
                ['Drivetrain', stats.drivetrain],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-ink-500">{k}</dt>
                  <dd className="font-medium text-ink-200">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="panel p-4">
            <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Realtime preview (BETA)</p>
            <p className="mt-2 text-xs text-ink-400">
              In-game live apply requires a server resource with <code className="text-brand-300">fivetools.tryhandling</code>. Not wired in this build — export the ZIP and ensure it on your server.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-sm">
              <span className="flex-1 truncate">/tryhandling {tryCode}</span>
              <button
                type="button"
                className="text-ink-400 hover:text-brand-300"
                onClick={async () => {
                  await navigator.clipboard.writeText(`/tryhandling ${tryCode}`)
                  toast.info('Copied')
                }}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </ToolShell>
  )
}
