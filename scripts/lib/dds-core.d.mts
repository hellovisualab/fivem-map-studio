export interface DdsInfo {
  width: number
  height: number
  codec: string
}

export function decodeDds(buffer: ArrayBuffer): { data: Uint8ClampedArray<ArrayBuffer>; info: DdsInfo }
export function isDds(name: string): boolean
