import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Group, Image as KImage, Layer, Line, Rect, Shape, Stage, Transformer } from 'react-konva'
import useImage from 'use-image'
import { useEditor } from '@/store/useEditor'
import { useAuth } from '@/store/useAuth'
import { canvasApi } from '@/lib/canvasApi'
import { MAX_ZOOM, MIN_ZOOM } from '@/lib/constants'
import { createImage, createLine, createMarker, createRectZone, createText, createZone } from '@/lib/elements'
import { isClipped } from '@/lib/mapStyle'
import { useStyledBase } from '@/hooks/useStyledBase'
import { useBaseSrc } from '@/hooks/useBaseSrc'
import { getData } from '@/lib/data'
import { clamp, loadImage, readFileAsDataURL } from '@/lib/utils'
import { toast } from '@/components/ui/Toast'
import type { BaseMap, MapElement } from '@/types'
import { ElementNode, type NodeHandlers } from './nodes'

type Draft =
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'poly'; points: number[]; cursor: { x: number; y: number } | null }

const EMPTY_BASE: BaseMap = { preset: 'custom', src: '', width: 1, height: 1, tint: '#000000', tintOpacity: 0, brightness: 1 }

const applyColor = (el: MapElement, color: string): Partial<MapElement> => {
  switch (el.type) {
    case 'text':
      return { fill: color } as Partial<MapElement>
    case 'zone':
      return { fill: color, stroke: color } as Partial<MapElement>
    case 'line':
      return { stroke: color } as Partial<MapElement>
    case 'marker':
      return { color } as Partial<MapElement>
    default:
      return {}
  }
}

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const trRef = useRef<Konva.Transformer>(null)
  const nodeRefs = useRef(new Map<string, Konva.Node>())
  const panRef = useRef<{ sx: number; sy: number; vx: number; vy: number } | null>(null)
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)
  const fittedFor = useRef<string | null>(null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [spaceDown, setSpaceDown] = useState(false)
  const [draft, setDraftState] = useState<Draft | null>(null)
  // Mirror of `draft` for event handlers, so store actions never run inside a React updater.
  const draftRef = useRef<Draft | null>(null)
  const setDraft = useCallback((next: Draft | null) => {
    draftRef.current = next
    setDraftState(next)
  }, [])
  const [editingText, setEditingText] = useState<{ id: string; value: string; left: number; top: number; fontSize: number; color: string; width: number } | null>(null)

  const doc = useEditor((s) => s.doc)
  const projectId = useEditor((s) => s.project?.id)
  const viewport = useEditor((s) => s.viewport)
  const tool = useEditor((s) => s.tool)
  const selectedIds = useEditor((s) => s.selectedIds)
  const zoneType = useEditor((s) => s.zoneType)
  const markerIcon = useEditor((s) => s.markerIcon)
  const {
    setViewport,
    setPointer,
    select,
    clearSelection,
    addElement,
    updateElement,
    beginTransaction,
    endTransaction,
    setTool,
  } = useEditor.getState()
  const user = useAuth((s) => s.user)

  const baseSrc = useBaseSrc(doc)
  const [baseImg] = useImage(baseSrc, 'anonymous')
  const styled = useStyledBase(baseImg, doc?.baseMap ?? EMPTY_BASE)
  const clippedElements = useMemo(() => doc?.elements.filter(isClipped) ?? [], [doc?.elements])
  const freeElements = useMemo(() => doc?.elements.filter((e) => !isClipped(e)) ?? [], [doc?.elements])

  // Container size tracking
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const d = useEditor.getState().doc
    if (!d || !size.w || !size.h) return
    const pad = 40
    const scale = clamp(Math.min((size.w - pad) / d.baseMap.width, (size.h - pad) / d.baseMap.height), MIN_ZOOM, MAX_ZOOM)
    setViewport({
      scale,
      x: (size.w - d.baseMap.width * scale) / 2,
      y: (size.h - d.baseMap.height * scale) / 2,
    })
  }, [size.w, size.h, setViewport])

  useEffect(() => {
    if (!projectId || !size.w || fittedFor.current === projectId) return
    fittedFor.current = projectId
    fit()
  }, [projectId, size.w, fit])

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const vp = useEditor.getState().viewport
      const px = cx ?? size.w / 2
      const py = cy ?? size.h / 2
      const next = clamp(vp.scale * factor, MIN_ZOOM, MAX_ZOOM)
      const mx = (px - vp.x) / vp.scale
      const my = (py - vp.y) / vp.scale
      setViewport({ scale: next, x: px - mx * next, y: py - my * next })
    },
    [size.w, size.h, setViewport],
  )

  const viewCenter = useCallback(() => {
    const vp = useEditor.getState().viewport
    return { x: (size.w / 2 - vp.x) / vp.scale, y: (size.h / 2 - vp.y) / vp.scale }
  }, [size.w, size.h])

  const addImageFiles = useCallback(
    async (files: File[]) => {
      const d = useEditor.getState().doc
      if (!d) return
      for (const f of files) {
        if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
          toast.error('Unsupported image', `${f.name} must be PNG, JPG or WebP.`)
          continue
        }
        try {
          const url = user ? await getData().uploadAsset(user.id, f, f.name.replace(/\.[^.]+$/, '')) : await readFileAsDataURL(f)
          const img = await loadImage(url)
          const maxSide = Math.min(d.baseMap.width, d.baseMap.height) * 0.3
          const s = Math.min(1, maxSide / Math.max(img.width, img.height))
          const w = img.width * s
          const h = img.height * s
          const c = viewCenter()
          addElement(createImage(c.x - w / 2, c.y - h / 2, url, w, h, f.name.replace(/\.[^.]+$/, '')))
        } catch (e) {
          toast.error('Could not add image', (e as Error).message)
        }
      }
      setTool('select')
    },
    [user, addElement, setTool, viewCenter],
  )

  const finishDraft = useCallback(() => {
    const cur = draftRef.current
    setDraft(null)
    if (!cur || cur.kind !== 'poly') return
    const t = useEditor.getState().tool
    if (t === 'polygon' && cur.points.length >= 6) {
      addElement(createZone(cur.points, useEditor.getState().zoneType))
      setTool('select')
    } else if (t === 'line' && cur.points.length >= 4) {
      addElement(createLine(cur.points))
      setTool('select')
    }
  }, [addElement, setTool, setDraft])

  useEffect(() => {
    canvasApi.fit = fit
    canvasApi.zoomBy = (f) => zoomAt(f)
    canvasApi.zoomTo = (s) => {
      const vp = useEditor.getState().viewport
      zoomAt(s / vp.scale)
    }
    canvasApi.addImageFiles = addImageFiles
    canvasApi.finishDraft = finishDraft
    canvasApi.cancelDraft = () => setDraft(null)
    canvasApi.hasDraft = () => draftRef.current !== null
    canvasApi.centerOn = (x, y) => {
      const vp = useEditor.getState().viewport
      setViewport({ x: size.w / 2 - x * vp.scale, y: size.h / 2 - y * vp.scale })
    }
  }, [fit, zoomAt, addImageFiles, finishDraft, setDraft, setViewport, size.w, size.h])

  // Space bar = temporary hand tool
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // Cancel drafts when switching tools
  useEffect(() => {
    setDraft(null)
  }, [tool, setDraft])

  // Transformer sync
  useEffect(() => {
    const tr = trRef.current
    if (!tr) return
    const d = useEditor.getState().doc
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => !!n)
      .filter((n) => {
        const el = d?.elements.find((e) => e.id === n.id())
        return el && !el.locked && el.visible
      })
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, doc])

  const panning = tool === 'move' || spaceDown

  const mapPos = () => {
    const stage = stageRef.current
    if (!stage) return null
    const p = stage.getRelativePointerPosition()
    return p ? { x: p.x, y: p.y } : null
  }

  const onWheel = (e: KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    const p = stage?.getPointerPosition()
    if (!p) return
    if (e.evt.ctrlKey || e.evt.metaKey || !e.evt.shiftKey) {
      const factor = Math.exp(-e.evt.deltaY * 0.0015)
      zoomAt(factor, p.x, p.y)
    } else {
      const vp = useEditor.getState().viewport
      setViewport({ x: vp.x - e.evt.deltaY, y: vp.y - e.evt.deltaX })
    }
  }

  const onPointerDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current
    if (!stage) return
    const evt = e.evt as MouseEvent
    const screen = stage.getPointerPosition()
    if ('button' in evt && evt.button === 1 && screen) {
      const vp = useEditor.getState().viewport
      panRef.current = { sx: screen.x, sy: screen.y, vx: vp.x, vy: vp.y }
      return
    }
    if (panning) return
    const p = mapPos()
    if (!p) return
    // Elements stop listening while drawing, so the rectangle can start anywhere.
    if (tool === 'zone') setDraft({ kind: 'rect', x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }

  const onPointerMove = () => {
    const stage = stageRef.current
    if (!stage) return
    const screen = stage.getPointerPosition()
    if (panRef.current && screen) {
      setViewport({ x: panRef.current.vx + (screen.x - panRef.current.sx), y: panRef.current.vy + (screen.y - panRef.current.sy) })
      return
    }
    const p = mapPos()
    if (!p) return
    setPointer(p)
    const cur = draftRef.current
    if (cur?.kind === 'rect') setDraft({ ...cur, x1: p.x, y1: p.y })
    else if (cur?.kind === 'poly') setDraft({ ...cur, cursor: p })
  }

  const onPointerUp = () => {
    if (panRef.current) {
      panRef.current = null
      return
    }
    const cur = draftRef.current
    if (cur?.kind === 'rect') {
      const w = Math.abs(cur.x1 - cur.x0)
      const h = Math.abs(cur.y1 - cur.y0)
      if (w > 4 && h > 4) {
        addElement(createRectZone(Math.min(cur.x0, cur.x1), Math.min(cur.y0, cur.y1), Math.max(cur.x0, cur.x1), Math.max(cur.y0, cur.y1), zoneType))
        setTool('select')
      }
      setDraft(null)
    }
  }

  const onStageClick = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = stageRef.current
    if (!stage || panning) return
    if ('button' in e.evt && (e.evt as MouseEvent).button === 1) return
    const p = mapPos()
    if (!p) return
    const clickedEmpty = e.target === stage
    switch (tool) {
      case 'select':
        if (clickedEmpty) clearSelection()
        break
      case 'text':
        addElement(createText(p.x - 10, p.y - 20))
        setTool('select')
        break
      case 'marker':
        addElement(createMarker(p.x, p.y, markerIcon))
        setTool('select')
        break
      case 'polygon':
      case 'line': {
        const cur = draftRef.current
        if (!cur || cur.kind !== 'poly') {
          setDraft({ kind: 'poly', points: [p.x, p.y], cursor: p })
          break
        }
        // Close polygon when clicking near the first vertex.
        if (tool === 'polygon' && cur.points.length >= 6) {
          const scale = useEditor.getState().viewport.scale
          if (Math.hypot(cur.points[0] - p.x, cur.points[1] - p.y) < 12 / scale) {
            finishDraft()
            break
          }
        }
        setDraft({ ...cur, points: [...cur.points, p.x, p.y], cursor: p })
        break
      }
      case 'color':
        break
      default:
        break
    }
  }

  const onDblClick = () => {
    if (tool !== 'polygon' && tool !== 'line') return
    const cur = draftRef.current
    if (!cur || cur.kind !== 'poly' || cur.points.length < 4) return
    // Two quick clicks at different spots are just fast vertex placement;
    // only a real double-click (same spot) finishes the shape.
    const n = cur.points.length
    const tolerance = 6 / useEditor.getState().viewport.scale
    const samePlace = Math.hypot(cur.points[n - 2] - cur.points[n - 4], cur.points[n - 1] - cur.points[n - 3]) < tolerance
    if (!samePlace) return
    // The double-click's second click added a duplicate vertex; drop it.
    draftRef.current = { ...cur, points: cur.points.slice(0, -2) }
    finishDraft()
  }

  // Touch pinch zoom
  const onTouchMove = (e: KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches
    if (touches.length === 2) {
      e.evt.preventDefault()
      const stage = stageRef.current
      if (!stage) return
      const rect = stage.container().getBoundingClientRect()
      const [a, b] = [touches[0], touches[1]]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const cx = (a.clientX + b.clientX) / 2 - rect.left
      const cy = (a.clientY + b.clientY) / 2 - rect.top
      if (!pinchRef.current) {
        pinchRef.current = { dist, scale: useEditor.getState().viewport.scale }
        return
      }
      const vp = useEditor.getState().viewport
      const target = clamp((pinchRef.current.scale * dist) / pinchRef.current.dist, MIN_ZOOM, MAX_ZOOM)
      zoomAt(target / vp.scale, cx, cy)
      return
    }
    onPointerMove()
  }

  const onTouchEnd = () => {
    pinchRef.current = null
    onPointerUp()
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length) await addImageFiles(files)
  }

  const handlers: NodeHandlers = useMemo(
    () => ({
      draggable: tool === 'select',
      listening: tool === 'select' || tool === 'color',
      register: (id, node) => {
        if (node) nodeRefs.current.set(id, node)
        else nodeRefs.current.delete(id)
      },
      onSelect: (id, e) => {
        e.cancelBubble = true
        const st = useEditor.getState()
        if (st.tool === 'color') {
          const el = st.doc?.elements.find((x) => x.id === id)
          if (el && !el.locked) st.updateElement(id, applyColor(el, st.paintColor))
          return
        }
        if (st.tool !== 'select') return
        const additive = 'shiftKey' in e.evt && (e.evt as MouseEvent).shiftKey
        select([id], additive)
      },
      onDragStart: () => beginTransaction(),
      onDragMove: (id, e) => updateElement(id, { x: e.target.x(), y: e.target.y() }, true),
      onDragEnd: (id, e) => {
        let x = e.target.x()
        let y = e.target.y()
        const d = useEditor.getState().doc
        if (d?.grid.enabled) {
          x = Math.round(x / d.grid.size) * d.grid.size
          y = Math.round(y / d.grid.size) * d.grid.size
          e.target.position({ x, y })
        }
        updateElement(id, { x, y }, true)
        endTransaction()
      },
      onTransformStart: () => beginTransaction(),
      onTransformEnd: (el, e) => {
        const node = e.target
        const sx = node.scaleX()
        const sy = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        const patch: Record<string, unknown> = { x: node.x(), y: node.y(), rotation: node.rotation() }
        switch (el.type) {
          case 'text':
            patch.fontSize = Math.max(6, el.fontSize * Math.max(sx, sy))
            break
          case 'image':
            patch.width = Math.max(4, el.width * sx)
            patch.height = Math.max(4, el.height * sy)
            break
          case 'zone':
          case 'line':
            patch.points = el.points.map((v, i) => (i % 2 === 0 ? v * sx : v * sy))
            break
          case 'marker':
            patch.size = Math.max(8, el.size * Math.max(sx, sy))
            break
        }
        updateElement(el.id, patch as Partial<MapElement>, true)
        endTransaction()
      },
      onDblClick: (el) => {
        if (el.type !== 'text' || el.locked) return
        const node = nodeRefs.current.get(el.id)
        const stage = stageRef.current
        if (!node || !stage) return
        const abs = node.getAbsolutePosition()
        const vp = useEditor.getState().viewport
        setEditingText({
          id: el.id,
          value: el.text,
          left: abs.x,
          top: abs.y,
          fontSize: el.fontSize * vp.scale,
          color: el.fill,
          width: Math.max(160, node.width() * vp.scale + 40),
        })
      },
    }),
    [tool, select, beginTransaction, endTransaction, updateElement],
  )

  const commitTextEdit = () => {
    if (!editingText) return
    const value = editingText.value.trim()
    if (value) updateElement(editingText.id, { text: value, name: value.slice(0, 40) } as Partial<MapElement>)
    setEditingText(null)
  }

  if (!doc) return <div ref={containerRef} className="h-full w-full" />

  const { width: mapW, height: mapH } = doc.baseMap
  const cursor = panning ? 'grab' : tool === 'select' ? 'default' : tool === 'color' ? 'cell' : 'crosshair'
  const singleSelected = selectedIds.length === 1 ? doc.elements.find((e) => e.id === selectedIds[0]) : undefined
  const keepRatio = singleSelected ? singleSelected.type === 'text' || singleSelected.type === 'marker' : false

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full touch-none overflow-hidden bg-ink-950"
      style={{ cursor }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-60" />
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          draggable={panning}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) setViewport({ x: e.target.x(), y: e.target.y() })
          }}
          onWheel={onWheel}
          onMouseDown={onPointerDown}
          onTouchStart={onPointerDown}
          onMouseMove={onPointerMove}
          onTouchMove={onTouchMove}
          onMouseUp={onPointerUp}
          onTouchEnd={onTouchEnd}
          onMouseLeave={() => setPointer(null)}
          onClick={onStageClick}
          onTap={onStageClick}
          onDblClick={onDblClick}
          onDblTap={onDblClick}
        >
          {/*
            Base map. Draw order matters for the Photoshop-style effects:
            island → elements clipped to the map (with blend modes) → destination-in
            silhouette mask → glow and background behind (destination-over) → grid.
          */}
          <Layer>
            {styled ? (
              <>
                <KImage image={styled.island} x={0} y={0} width={mapW} height={mapH} listening={false} />
                {clippedElements.map((el) => (
                  <ElementNode key={el.id} el={el} h={handlers} />
                ))}
                {clippedElements.length > 0 && <KImage image={styled.mask} x={0} y={0} width={mapW} height={mapH} globalCompositeOperation="destination-in" listening={false} />}
                {styled.glow && <KImage image={styled.glow} x={0} y={0} width={mapW} height={mapH} globalCompositeOperation="destination-over" listening={false} />}
              </>
            ) : (
              baseImg && <KImage image={baseImg} x={0} y={0} width={mapW} height={mapH} listening={false} />
            )}
            <Rect
              x={0}
              y={0}
              width={mapW}
              height={mapH}
              fill={doc.background === 'transparent' ? '#101014' : doc.background}
              globalCompositeOperation="destination-over"
              listening={false}
            />
            {doc.background === 'transparent' && (
              <Shape
                listening={false}
                globalCompositeOperation="destination-over"
                sceneFunc={(ctx, shape) => {
                  // Checkerboard hint that the sea will export with alpha.
                  const s = Math.max(24, Math.round(mapW / 24))
                  ctx.fillStyle = '#1a1a20'
                  for (let y = 0; y < mapH; y += s)
                    for (let x = (y / s) % 2 === 0 ? 0 : s; x < mapW; x += s * 2) ctx.fillRect(x, y, Math.min(s, mapW - x), Math.min(s, mapH - y))
                  ctx.fillStrokeShape(shape)
                }}
              />
            )}
            <Rect x={0} y={0} width={mapW} height={mapH} fill="#000" shadowColor="black" shadowBlur={40} shadowOpacity={0.6} globalCompositeOperation="destination-over" listening={false} />
            {doc.grid.enabled && (
              <Shape
                listening={false}
                sceneFunc={(ctx, shape) => {
                  const g = doc.grid.size
                  ctx.beginPath()
                  for (let x = 0; x <= mapW; x += g) {
                    ctx.moveTo(x, 0)
                    ctx.lineTo(x, mapH)
                  }
                  for (let y = 0; y <= mapH; y += g) {
                    ctx.moveTo(0, y)
                    ctx.lineTo(mapW, y)
                  }
                  ctx.fillStrokeShape(shape)
                }}
                stroke="rgba(255,138,31,0.35)"
                strokeWidth={1 / viewport.scale}
              />
            )}
          </Layer>

          {/* Elements */}
          <Layer>
            {freeElements.map((el) => (
              <ElementNode key={el.id} el={el} h={handlers} />
            ))}
            <Transformer
              ref={trRef}
              rotateEnabled
              keepRatio={keepRatio}
              enabledAnchors={keepRatio ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : undefined}
              anchorSize={9}
              anchorCornerRadius={3}
              anchorStroke="#ff8a1f"
              anchorFill="#0d0d11"
              borderStroke="#ff8a1f"
              borderDash={[4, 3]}
              rotateAnchorOffset={24}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox)}
            />
          </Layer>

          {/* Drafts */}
          <Layer listening={false}>
            {draft?.kind === 'rect' && (
              <Rect
                x={Math.min(draft.x0, draft.x1)}
                y={Math.min(draft.y0, draft.y1)}
                width={Math.abs(draft.x1 - draft.x0)}
                height={Math.abs(draft.y1 - draft.y0)}
                fill="rgba(255,138,31,0.2)"
                stroke="#ff8a1f"
                strokeWidth={2 / viewport.scale}
                dash={[6 / viewport.scale, 4 / viewport.scale]}
              />
            )}
            {draft?.kind === 'poly' && (
              <Group>
                <Line
                  points={draft.cursor ? [...draft.points, draft.cursor.x, draft.cursor.y] : draft.points}
                  stroke="#ff8a1f"
                  strokeWidth={2 / viewport.scale}
                  dash={[6 / viewport.scale, 4 / viewport.scale]}
                  closed={tool === 'polygon' && draft.points.length >= 6}
                  fill={tool === 'polygon' ? 'rgba(255,138,31,0.15)' : undefined}
                />
                {Array.from({ length: draft.points.length / 2 }, (_, i) => (
                  <Circle
                    key={i}
                    x={draft.points[i * 2]}
                    y={draft.points[i * 2 + 1]}
                    radius={(i === 0 ? 6 : 4) / viewport.scale}
                    fill={i === 0 ? '#ff8a1f' : '#0d0d11'}
                    stroke="#ff8a1f"
                    strokeWidth={1.5 / viewport.scale}
                  />
                ))}
              </Group>
            )}
          </Layer>
        </Stage>
      )}

      {editingText && (
        <textarea
          autoFocus
          value={editingText.value}
          onChange={(e) => setEditingText({ ...editingText, value: e.target.value })}
          onBlur={commitTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              commitTextEdit()
            }
            if (e.key === 'Escape') setEditingText(null)
          }}
          className="absolute z-20 resize-none rounded border border-brand-500 bg-ink-950/90 px-1 font-bold outline-none"
          style={{
            left: editingText.left,
            top: editingText.top,
            fontSize: editingText.fontSize,
            color: editingText.color,
            width: editingText.width,
            lineHeight: 1.2,
          }}
          rows={1}
        />
      )}

      {(tool === 'polygon' || tool === 'line') && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-ink-700 bg-ink-900/90 px-3 py-1.5 text-xs text-ink-300 backdrop-blur">
          Click to add points · <span className="text-ink-100">Enter</span> or double-click to finish · <span className="text-ink-100">Esc</span> to cancel
        </div>
      )}
    </div>
  )
}
