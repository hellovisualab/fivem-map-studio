import { useEffect, useState } from 'react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { Arrow, Circle, Group, Image as KImage, Line, Path, Text } from 'react-konva'
import useImage from 'use-image'
import type { FontFamily, ImageElement, LineElement, MapElement, MarkerElement, TextElement, ZoneElement } from '@/types'
import { MARKER_PATHS } from '@/lib/icons'
import { effectsOf, toComposite } from '@/lib/mapStyle'
import { isFontLoaded, loadFont } from '@/lib/fonts'
import { rgba } from '@/lib/utils'

export interface NodeHandlers {
  draggable: boolean
  listening: boolean
  register: (id: string, node: Konva.Node | null) => void
  onSelect: (id: string, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
  onDragStart: () => void
  onDragMove: (id: string, e: KonvaEventObject<DragEvent>) => void
  onDragEnd: (id: string, e: KonvaEventObject<DragEvent>) => void
  onTransformStart: () => void
  onTransformEnd: (el: MapElement, e: KonvaEventObject<Event>) => void
  onDblClick: (el: MapElement, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
}

/** Shadow attrs only take effect on shapes, so groups spread them onto their main child. */
function shadowProps(el: MapElement) {
  const fx = effectsOf(el)
  return {
    shadowEnabled: fx.shadowEnabled,
    shadowColor: fx.shadowColor,
    shadowBlur: fx.shadowBlur,
    shadowOffsetX: fx.shadowOffsetX,
    shadowOffsetY: fx.shadowOffsetY,
    shadowOpacity: fx.shadowOpacity,
    shadowForStrokeEnabled: false,
  }
}

function common(el: MapElement, h: NodeHandlers) {
  return {
    id: el.id,
    name: 'element',
    x: el.x,
    y: el.y,
    rotation: el.rotation,
    opacity: el.opacity,
    visible: el.visible,
    globalCompositeOperation: toComposite(effectsOf(el).blend),
    draggable: h.draggable && !el.locked,
    listening: h.listening && el.visible,
    ref: (n: Konva.Node | null) => h.register(el.id, n),
    onClick: (e: KonvaEventObject<MouseEvent>) => h.onSelect(el.id, e),
    onTap: (e: KonvaEventObject<TouchEvent>) => h.onSelect(el.id, e),
    onDblClick: (e: KonvaEventObject<MouseEvent>) => h.onDblClick(el, e),
    onDblTap: (e: KonvaEventObject<TouchEvent>) => h.onDblClick(el, e),
    onDragStart: h.onDragStart,
    onDragMove: (e: KonvaEventObject<DragEvent>) => h.onDragMove(el.id, e),
    onDragEnd: (e: KonvaEventObject<DragEvent>) => h.onDragEnd(el.id, e),
    onTransformStart: h.onTransformStart,
    onTransformEnd: (e: KonvaEventObject<Event>) => h.onTransformEnd(el, e),
  }
}

/** Resolves to the family once its webfont is ready; falls back to Inter meanwhile. */
function useFontFamily(family: FontFamily): string {
  const [ready, setReady] = useState(() => isFontLoaded(family))
  useEffect(() => {
    let alive = true
    if (isFontLoaded(family)) {
      setReady(true)
      return
    }
    setReady(false)
    loadFont(family).then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [family])
  return ready ? `"${family}", Inter, sans-serif` : 'Inter, sans-serif'
}

export const displayText = (el: TextElement) => (el.uppercase ? el.text.toUpperCase() : el.text)

export function TextNode({ el, h }: { el: TextElement; h: NodeHandlers }) {
  const fontFamily = useFontFamily(el.fontFamily)
  return (
    <Text
      {...common(el, h)}
      {...shadowProps(el)}
      text={displayText(el)}
      fontSize={el.fontSize}
      fontFamily={fontFamily}
      fontStyle={el.fontStyle}
      letterSpacing={el.letterSpacing ?? 0}
      fill={el.fill}
      stroke={el.strokeWidth ? el.stroke : undefined}
      strokeWidth={el.strokeWidth ? el.strokeWidth * 2 : 0}
      fillAfterStrokeEnabled
      perfectDrawEnabled={false}
    />
  )
}

export function ImageNode({ el, h }: { el: ImageElement; h: NodeHandlers }) {
  const [img] = useImage(el.src, 'anonymous')
  return <KImage {...common(el, h)} {...shadowProps(el)} image={img} width={el.width} height={el.height} perfectDrawEnabled={false} />
}

export function ZoneNode({ el, h }: { el: ZoneElement; h: NodeHandlers }) {
  let cx = 0
  let cy = 0
  const n = el.points.length / 2 || 1
  for (let i = 0; i < el.points.length; i += 2) {
    cx += el.points[i]
    cy += el.points[i + 1]
  }
  cx /= n
  cy /= n
  return (
    <Group {...common(el, h)}>
      <Line
        {...shadowProps(el)}
        points={el.points}
        closed
        fill={rgba(el.fill, el.fillOpacity)}
        stroke={el.strokeWidth > 0 ? el.stroke : undefined}
        strokeWidth={el.strokeWidth}
        lineJoin="round"
        perfectDrawEnabled={false}
      />
      {el.showLabel && el.name && (
        <Text
          x={cx - 200}
          y={cy - 14}
          width={400}
          align="center"
          text={el.name}
          fontSize={22}
          fontStyle="bold"
          fontFamily="Inter, sans-serif"
          fill="#ffffff"
          stroke="rgba(0,0,0,0.75)"
          strokeWidth={4}
          fillAfterStrokeEnabled
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}

export function LineNode({ el, h }: { el: LineElement; h: NodeHandlers }) {
  const props = {
    ...common(el, h),
    ...shadowProps(el),
    points: el.points,
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    dash: el.dash ? [el.strokeWidth * 3, el.strokeWidth * 2] : undefined,
    hitStrokeWidth: Math.max(20, el.strokeWidth * 2),
    perfectDrawEnabled: false,
  }
  if (el.arrow) {
    return <Arrow {...props} fill={el.stroke} pointerLength={el.strokeWidth * 4} pointerWidth={el.strokeWidth * 3.5} />
  }
  return <Line {...props} />
}

function CustomMarkerImage({ src, r }: { src: string; r: number }) {
  const [img] = useImage(src, 'anonymous')
  const s = r * 1.2
  return (
    <Group
      clipFunc={(ctx) => {
        ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2, false)
      }}
    >
      <KImage image={img} x={-s / 2} y={-s / 2} width={s} height={s} listening={false} />
    </Group>
  )
}

export function MarkerNode({ el, h }: { el: MarkerElement; h: NodeHandlers }) {
  const r = el.size / 2
  const scale = (el.size * 0.6) / 24
  const fx = effectsOf(el)
  return (
    <Group {...common(el, h)}>
      <Circle
        radius={r}
        fill={el.color}
        stroke="#ffffff"
        strokeWidth={Math.max(1.5, el.size * 0.07)}
        {...(fx.shadowEnabled ? shadowProps(el) : { shadowColor: 'black', shadowBlur: 8, shadowOpacity: 0.4 })}
      />
      {el.icon === 'custom' && el.customSrc ? (
        <CustomMarkerImage src={el.customSrc} r={r} />
      ) : (
        <Path data={MARKER_PATHS[el.icon]} fill="#ffffff" x={-12 * scale} y={-12 * scale} scaleX={scale} scaleY={scale} listening={false} />
      )}
      {el.label && (
        <Text
          x={-150}
          y={r + 4}
          width={300}
          align="center"
          text={el.label}
          fontSize={Math.max(12, el.size * 0.42)}
          fontStyle="bold"
          fontFamily="Inter, sans-serif"
          fill="#ffffff"
          stroke="rgba(0,0,0,0.75)"
          strokeWidth={4}
          fillAfterStrokeEnabled
          listening={false}
        />
      )}
    </Group>
  )
}

export function ElementNode({ el, h }: { el: MapElement; h: NodeHandlers }) {
  switch (el.type) {
    case 'text':
      return <TextNode el={el} h={h} />
    case 'image':
      return <ImageNode el={el} h={h} />
    case 'zone':
      return <ZoneNode el={el} h={h} />
    case 'line':
      return <LineNode el={el} h={h} />
    case 'marker':
      return <MarkerNode el={el} h={h} />
  }
}
