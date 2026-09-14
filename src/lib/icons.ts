import type { MarkerIcon } from '@/types'

/** 24x24 SVG path data for marker glyphs, shared by the Konva canvas and the 2D exporter. */
export const MARKER_PATHS: Record<MarkerIcon, string> = {
  police: 'M12 2 L20 5.5 V11.5 C20 16.5 16.5 20.5 12 22 C7.5 20.5 4 16.5 4 11.5 V5.5 Z M12 6.5 L13.2 9.6 L16.5 9.8 L14 12 L14.8 15.2 L12 13.5 L9.2 15.2 L10 12 L7.5 9.8 L10.8 9.6 Z',
  hospital: 'M9 3 H15 V9 H21 V15 H15 V21 H9 V15 H3 V9 H9 Z',
  bank: 'M3 9.5 L12 4 L21 9.5 V11 H3 Z M5 12.5 H7.5 V18 H5 Z M10.5 12.5 H13.5 V18 H10.5 Z M16.5 12.5 H19 V18 H16.5 Z M3 19.5 H21 V21.5 H3 Z',
  shop: 'M5.5 8 H18.5 L19.5 21.5 H4.5 Z M9 8 V6.5 A3 3 0 0 1 15 6.5 V8 H13.5 V6.5 A1.5 1.5 0 0 0 10.5 6.5 V8 Z',
  garage: 'M3 10 L12 3.5 L21 10 V21 H17.5 V14 H6.5 V21 H3 Z M8 15.5 H16 V17 H8 Z M8 18.5 H16 V20 H8 Z',
  custom: 'M12 2.5 A6.5 6.5 0 0 0 5.5 9 C5.5 13.5 12 21.5 12 21.5 S18.5 13.5 18.5 9 A6.5 6.5 0 0 0 12 2.5 Z M12 6.5 A2.5 2.5 0 1 1 12 11.5 A2.5 2.5 0 1 1 12 6.5 Z',
}
