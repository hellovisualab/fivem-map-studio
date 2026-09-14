import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, GizmoHelper, GizmoViewport, Grid, OrbitControls, TransformControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { Box, Move, RotateCcw, Scaling, Upload } from 'lucide-react'
import { ToolShell } from '@/components/tools/ToolShell'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { exportPropResource, type PropAsset } from '@/lib/propExport'
import { gateToolExport } from '@/lib/toolExport'
import { cn, downloadBlob, uid } from '@/lib/utils'

type Mode = 'translate' | 'rotate' | 'scale'
type RefKind = 'none' | 'player' | 'sofa' | 'car'

function GlbModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  return <primitive object={cloned} />
}

function ObjModel({ url }: { url: string }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    let alive = true
    new OBJLoader().load(url, (group) => {
      if (!alive) return
      group.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          ;(c as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: '#c4c4cc', metalness: 0.1, roughness: 0.7 })
        }
      })
      setObj(group)
    })
    return () => {
      alive = false
    }
  }, [url])
  if (!obj) return null
  return <primitive object={obj} />
}

function PropMesh({ prop }: { prop: PropAsset }) {
  const lower = prop.file.name.toLowerCase()
  if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return <GlbModel url={prop.url} />
  if (lower.endsWith('.obj')) return <ObjModel url={prop.url} />
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ff8a1f" wireframe />
    </mesh>
  )
}

function Reference({ kind }: { kind: RefKind }) {
  if (kind === 'player') {
    return (
      <group position={[2, 0, 0]}>
        <mesh position={[0, 0.9, 0]}>
          <capsuleGeometry args={[0.28, 1.1, 6, 12]} />
          <meshStandardMaterial color="#6b8cff" transparent opacity={0.55} />
        </mesh>
      </group>
    )
  }
  if (kind === 'sofa') {
    return (
      <group position={[-2.2, 0.35, 0]}>
        <mesh>
          <boxGeometry args={[1.8, 0.7, 0.8]} />
          <meshStandardMaterial color="#8b7355" transparent opacity={0.55} />
        </mesh>
      </group>
    )
  }
  if (kind === 'car') {
    return (
      <group position={[0, 0.4, -2.5]}>
        <mesh>
          <boxGeometry args={[2.2, 0.7, 4.2]} />
          <meshStandardMaterial color="#d4d4d8" transparent opacity={0.45} />
        </mesh>
      </group>
    )
  }
  return null
}

function PropWithGizmo({
  prop,
  selected,
  mode,
  onSelect,
  onChange,
}: {
  prop: PropAsset
  selected: boolean
  mode: Mode
  onSelect: () => void
  onChange: (patch: Partial<PropAsset>) => void
}) {
  const group = useRef<THREE.Group>(null)
  const [ready, setReady] = useState(false)
  const { controls } = useThree()
  const rot = prop.rotation.map((d) => (d * Math.PI) / 180) as [number, number, number]

  useEffect(() => {
    setReady(!!group.current)
  }, [prop.id, selected])

  return (
    <>
      <group
        ref={group}
        position={prop.position}
        rotation={rot}
        scale={prop.scale}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <Suspense
          fallback={
            <mesh>
              <boxGeometry />
              <meshStandardMaterial color="#444" wireframe />
            </mesh>
          }
        >
          <PropMesh prop={prop} />
        </Suspense>
      </group>
      {selected && ready && group.current && (
        <TransformControls
          object={group.current}
          mode={mode}
          onMouseDown={() => {
            const c = controls as { enabled?: boolean } | null
            if (c) c.enabled = false
          }}
          onMouseUp={() => {
            const c = controls as { enabled?: boolean } | null
            if (c) c.enabled = true
            const g = group.current
            if (!g) return
            onChange({
              position: [g.position.x, g.position.y, g.position.z],
              rotation: [(g.rotation.x * 180) / Math.PI, (g.rotation.y * 180) / Math.PI, (g.rotation.z * 180) / Math.PI],
              scale: [g.scale.x, g.scale.y, g.scale.z],
            })
          }}
        />
      )}
    </>
  )
}

function Scene({
  props,
  selectedId,
  mode,
  refKind,
  onSelect,
  onChange,
}: {
  props: PropAsset[]
  selectedId: string | null
  mode: Mode
  refKind: RefKind
  onSelect: (id: string) => void
  onChange: (id: string, patch: Partial<PropAsset>) => void
}) {
  return (
    <>
      <color attach="background" args={['#0a0a0e']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <Grid infiniteGrid fadeDistance={40} sectionColor="#2a2a35" cellColor="#1a1a22" />
      <ContactShadows opacity={0.35} scale={30} blur={2.5} far={12} />
      <Reference kind={refKind} />
      {props.map((prop) => (
        <PropWithGizmo
          key={prop.id}
          prop={prop}
          selected={prop.id === selectedId}
          mode={mode}
          onSelect={() => onSelect(prop.id)}
          onChange={(patch) => onChange(prop.id, patch)}
        />
      ))}
      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  )
}

export function PropCreator() {
  const [props, setProps] = useState<PropAsset[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('translate')
  const [refKind, setRefKind] = useState<RefKind>('player')
  const [projectName, setProjectName] = useState('prop_pack')
  const [busy, setBusy] = useState(false)
  const [linkScale, setLinkScale] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const selected = props.find((p) => p.id === selectedId) ?? null

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list)
    const next: PropAsset[] = []
    for (const file of files) {
      if (!/\.(glb|gltf|obj)$/i.test(file.name)) {
        toast.error('Unsupported', `${file.name} — use GLB or OBJ`)
        continue
      }
      next.push({
        id: uid(8),
        name: file.name.replace(/\.[^.]+$/, ''),
        url: URL.createObjectURL(file),
        file,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      })
    }
    if (!next.length) return
    setProps((p) => [...p, ...next])
    setSelectedId(next[0].id)
    toast.success(`Added ${next.length} prop${next.length === 1 ? '' : 's'}`)
  }, [])

  const patchProp = (id: string, patch: Partial<PropAsset>) => {
    setProps((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  const doExport = async () => {
    if (!props.length) {
      toast.error('No props', 'Drop a GLB or OBJ first.')
      return
    }
    setBusy(true)
    try {
      if (!(await gateToolExport('Prop Creator'))) return
      const blob = await exportPropResource(props, projectName)
      downloadBlob(blob, `${projectName || 'prop_pack'}.zip`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title={projectName || 'Prop Creator'} subtitle={`${props.length} prop${props.length === 1 ? '' : 's'} · session only`} onExport={() => void doExport()} exportLoading={busy}>
      <div className="grid h-full min-h-[calc(100vh-52px)] grid-cols-1 lg:grid-cols-[240px_1fr_280px]">
        <aside className="flex flex-col border-b border-ink-800 lg:border-r lg:border-b-0">
          <div className="border-b border-ink-800 px-3 py-3">
            <p className="text-xs font-semibold tracking-wider text-ink-500 uppercase">Props</p>
            <input className="field field-sm mt-2" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Resource name" />
          </div>
          <div className="flex-1 space-y-1 overflow-auto p-2">
            {!props.length && <p className="px-2 py-6 text-center text-xs text-ink-500">No props yet — drop a model below.</p>}
            {props.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm', selectedId === p.id ? 'bg-brand-500/15 text-brand-300' : 'text-ink-300 hover:bg-ink-850')}
              >
                <Box className="h-4 w-4 shrink-0" />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-ink-800 p-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                void addFiles(e.dataTransfer.files)
              }}
              className="flex w-full flex-col items-center rounded-xl border border-dashed border-ink-600 px-3 py-6 text-center text-xs text-ink-400 hover:border-brand-500/50 hover:text-brand-300"
            >
              <Upload className="mb-2 h-5 w-5" />
              Add prop · GLB / OBJ
            </button>
            <input ref={fileRef} type="file" multiple accept=".glb,.gltf,.obj" className="hidden" onChange={(e) => e.target.files && void addFiles(e.target.files)} />
          </div>
        </aside>

        <div className="relative min-h-[360px] bg-[#0a0a0e]">
          <div className="absolute top-3 left-3 z-10 flex gap-1 rounded-xl border border-ink-700 bg-ink-900/90 p-1 backdrop-blur">
            {(
              [
                ['translate', Move],
                ['rotate', RotateCcw],
                ['scale', Scaling],
              ] as const
            ).map(([m, Icon]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-lg p-2', mode === m ? 'bg-brand-500/20 text-brand-300' : 'text-ink-400 hover:text-ink-200')}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <div className="absolute bottom-3 left-3 z-10 flex gap-1">
            {(
              [
                ['none', 'None'],
                ['player', 'Player'],
                ['sofa', 'Sofa'],
                ['car', 'SultanRS'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setRefKind(id)}
                className={cn('rounded-lg border px-2 py-1 text-[11px]', refKind === id ? 'border-brand-500/50 bg-brand-500/15 text-brand-300' : 'border-ink-700 bg-ink-900/80 text-ink-400')}
              >
                {label}
              </button>
            ))}
          </div>
          {!props.length && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-sm text-ink-500">Drop a model to get started.</div>}
          <Canvas camera={{ position: [4, 3, 6], fov: 45 }} style={{ width: '100%', height: '100%' }}>
            <Scene props={props} selectedId={selectedId} mode={mode} refKind={refKind} onSelect={setSelectedId} onChange={patchProp} />
          </Canvas>
        </div>

        <aside className="space-y-4 overflow-auto border-t border-ink-800 p-3 lg:border-t-0 lg:border-l">
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Prop transform</p>
            {!selected ? (
              <p className="mt-2 text-xs text-ink-500">Select a prop</p>
            ) : (
              <div className="mt-2 space-y-3">
                {(['position', 'rotation', 'scale'] as const).map((key) => (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-ink-400 capitalize">{key}</span>
                      {key === 'scale' && (
                        <button type="button" className="text-[10px] text-brand-400" onClick={() => setLinkScale((v) => !v)}>
                          {linkScale ? 'Linked' : 'Unlinked'}
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {([0, 1, 2] as const).map((i) => (
                        <input
                          key={i}
                          className="field field-sm"
                          type="number"
                          step={key === 'rotation' ? 1 : 0.01}
                          value={Number(selected[key][i].toFixed(3))}
                          onChange={(e) => {
                            const n = Number(e.target.value)
                            const arr = [...selected[key]] as [number, number, number]
                            if (key === 'scale' && linkScale) patchProp(selected.id, { scale: [n, n, n] })
                            else {
                              arr[i] = n
                              patchProp(selected.id, { [key]: arr })
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full" onClick={() => patchProp(selected.id, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] })}>
                  Reset transform
                </Button>
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Materials</p>
            <p className="mt-2 text-xs text-ink-500">{selected ? 'Using embedded materials from the file.' : 'No materials — add a prop first.'}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wider text-ink-500 uppercase">Collisions</p>
            <p className="mt-2 text-xs text-ink-500">Collision mesh export lands with native .ydr support (roadmap).</p>
          </div>
        </aside>
      </div>
    </ToolShell>
  )
}
