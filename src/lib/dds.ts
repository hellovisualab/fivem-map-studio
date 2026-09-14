/**
 * Browser helpers around the shared DDS decoder (scripts/lib/dds-core.mjs).
 * The decoder itself is plain JS so the build script can reuse it in Node.
 */
import { decodeDds, isDds, type DdsInfo } from '../../scripts/lib/dds-core.mjs'

export { decodeDds, isDds }
export type { DdsInfo }

const DDS_MAGIC = 0x20534444 // 'DDS '

/** Decodes a DDS buffer straight onto a canvas. */
export function ddsToCanvas(buffer: ArrayBuffer): { canvas: HTMLCanvasElement; info: DdsInfo } {
  const { data, info } = decodeDds(buffer)
  const canvas = document.createElement('canvas')
  canvas.width = info.width
  canvas.height = info.height
  canvas.getContext('2d')!.putImageData(new ImageData(data, info.width, info.height), 0, 0)
  return { canvas, info }
}

export const isDdsBuffer = (buf: ArrayBuffer) => buf.byteLength >= 4 && new DataView(buf).getUint32(0, true) === DDS_MAGIC
