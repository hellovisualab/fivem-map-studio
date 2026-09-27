import { useRef, useState } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Circle, Group, Line } from 'react-konva'
import { useEditor } from '@/store/useEditor'
import { absolutePoints, rotatePoint } from '@/lib/geometry'
import { snapPoint, snapToGrid, type Point } from '@/lib/snapping'
import type { LineElement, MapElement, ZoneElement } from '@/types'

const PINK = '#ec4899'

/** Other shapes' corners and edges: what a dragged vertex snaps to. */
function snapTargets(selfId: string) {
  const vertices: Point[] = []
  const segments: [Point, Point][] = []
  for (const e of useEditor.getState().doc?.elements ?? []) {
    if (e.id === selfId || !e.visible || (e.type !== 'zone' && e.type !== 'line')) continue
    const pts = absolutePoints(e)
    vertices.push(...pts)
    for (let i = 0; i < pts.length - 1; i++) segments.push([pts[i], pts[i + 1]])
    if (e.type === 'zone' && pts.length > 2) segments.push([pts[pts.length - 1], pts[0]])
  }
  return { vertices, segments }
}

/**
 * Vertex handles for a zone or line: drag a point to move it (snapping to other
 * shapes' corners and edges, or the grid), press an edge's midpoint to insert a
 * point there, Alt+click (or select + Delete) to remove one.
 */
export function PointEditor({ el, scale }: { el: ZoneElement | LineElement; scale: number }) {
  const activeVertex = useEditor((s) => s.activeVertex)
  const { updateElement, beginTransaction, endTransaction, setActiveVertex, deleteVertex } = useEditor.getState()
  const [mark, setMark] = useState<Point | null>(null)
  const targets = useRef<ReturnType<typeof snapTargets> | null>(null)
  // Index of a just-inserted vertex that should pick up the ongoing press as a drag.
  const pendingDrag = useRef<number | null>(null)

  const pts = absolutePoints(el)
  const closed = el.type === 'zone'
  const current = () => useEditor.getState().doc?.elements.find((e): e is MapElement => e.id === el.id) as ZoneElement | LineElement | undefined

  const toLocal = (p: Point, shape: ZoneElement | LineElement) => rotatePoint(p.x - shape.x, p.y - shape.y, -shape.rotation)

  const insertAt = (index: number, p: Point, e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    e.cancelBubble = true
    const shape = current()
    if (!shape) return
    const local = toLocal(p, shape)
    const points = [...shape.points.slice(0, index * 2), local.x, local.y, ...shape.points.slice(index * 2)]
    updateElement(shape.id, { points } as Partial<MapElement>)
    setActiveVertex(index)
    pendingDrag.current = index
  }

  const onDragMove = (i: number, e: KonvaEventObject<DragEvent>) => {
    const shape = current()
    if (!shape) return
    const node = e.target
    let p: Point = { x: node.x(), y: node.y() }
    const st = useEditor.getState()
    const free = e.evt.altKey
    const hit = st.snap && !free && targets.current ? snapPoint(p, targets.current.vertices, targets.current.segments, 8 / scale) : null
    if (hit) p = hit.point
    else if (st.doc?.grid.enabled && !free) p = { x: snapToGrid(p.x, st.doc.grid.size), y: snapToGrid(p.y, st.doc.grid.size) }
    node.position(p)
    setMark(hit ? p : null)
    const local = toLocal(p, shape)
    const points = [...shape.points]
    points[i * 2] = local.x
    points[i * 2 + 1] = local.y
    updateElement(shape.id, { points } as Partial<MapElement>, true)
  }

  const r = 5 / scale
  const edges = closed ? pts.length : pts.length - 1
  return (
    <Group>
      <Line points={pts.flatMap((p) => [p.x, p.y])} closed={closed} stroke={PINK} strokeWidth={1.5 / scale} dash={[5 / scale, 4 / scale]} listening={false} />
      {Array.from({ length: edges }, (_, i) => {
        const a = pts[i]
        const b = pts[(i + 1) % pts.length]
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        return (
          <Circle
            key={`m${i}`}
            name="point-insert"
            x={m.x}
            y={m.y}
            radius={3.5 / scale}
            fill={PINK}
            opacity={0.55}
            stroke="#ffffff"
            strokeWidth={1 / scale}
            hitStrokeWidth={8 / scale}
            onMouseDown={(e) => insertAt(i + 1, m, e)}
            onTouchStart={(e) => insertAt(i + 1, m, e)}
          />
        )
      })}
      {pts.map((p, i) => (
        <Circle
          key={`v${i}`}
          name="point-handle"
          ref={(node: Konva.Circle | null) => {
            if (node && pendingDrag.current === i) {
              pendingDrag.current = null
              node.startDrag()
            }
          }}
          x={p.x}
          y={p.y}
          radius={r}
          fill={activeVertex === i ? PINK : '#ffffff'}
          stroke={PINK}
          strokeWidth={1.5 / scale}
          hitStrokeWidth={10 / scale}
          draggable
          onClick={(e) => {
            e.cancelBubble = true
            if (e.evt.altKey) deleteVertex(el.id, i)
            else setActiveVertex(i)
          }}
          onTap={(e) => {
            e.cancelBubble = true
            setActiveVertex(i)
          }}
          onDragStart={(e) => {
            e.cancelBubble = true
            beginTransaction()
            setActiveVertex(i)
            targets.current = snapTargets(el.id)
          }}
          onDragMove={(e) => {
            e.cancelBubble = true
            onDragMove(i, e)
          }}
          onDragEnd={(e) => {
            e.cancelBubble = true
            targets.current = null
            setMark(null)
            endTransaction()
          }}
        />
      ))}
      {mark && <Circle x={mark.x} y={mark.y} radius={9 / scale} stroke="#33dfff" strokeWidth={2 / scale} listening={false} />}
    </Group>
  )
}
