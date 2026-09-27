type FrameCallback = (now: number) => void

const callbacks = new Set<FrameCallback>()
let raf = 0

function loop(now: number) {
  raf = callbacks.size ? requestAnimationFrame(loop) : 0
  for (const cb of callbacks) {
    // One broken preview must not stop the others.
    try {
      cb(now)
    } catch (e) {
      console.error(e)
    }
  }
}

/** Runs `cb` on every animation frame; one shared loop drives all effect previews. */
export function onFrame(cb: FrameCallback) {
  callbacks.add(cb)
  if (!raf) raf = requestAnimationFrame(loop)
  return () => {
    callbacks.delete(cb)
  }
}
