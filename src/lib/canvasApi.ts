/**
 * Imperative bridge so toolbars/shortcuts can talk to the mounted canvas
 * without threading refs through the tree. The canvas overrides these on mount.
 */
export const canvasApi = {
  fit: () => {},
  zoomBy: (_factor: number) => {},
  zoomTo: (_scale: number) => {},
  addImageFiles: async (_files: File[]) => {},
  finishDraft: () => {},
  cancelDraft: () => {},
  hasDraft: () => false,
  centerOn: (_x: number, _y: number) => {},
  /** The part of the document currently on screen (document pixels). */
  visibleRect: (): { x: number; y: number; width: number; height: number } => ({ x: 0, y: 0, width: 0, height: 0 }),
  /** Zooms and pans so a rectangle (document pixels) fills the view. */
  fitRect: (_rect: { x: number; y: number; width: number; height: number }) => {},
}
