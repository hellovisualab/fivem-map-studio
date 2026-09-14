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
}
