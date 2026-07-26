// Device capability detection, resolved once at startup. Used to scale rendering
// cost down on phones — the reflective floor in particular re-renders the scene to
// a texture every frame, which a mobile GPU cannot afford.

function query(q: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(q).matches
    : false
}

const coarsePointer = query('(pointer: coarse)')
const smallScreen =
  typeof window !== 'undefined' ? Math.min(window.innerWidth, window.innerHeight) < 820 : false

/** Touch-first device on a phone/small-tablet screen. */
export const isMobile = coarsePointer && smallScreen

/** Touch input available at all (includes large tablets). */
export const isTouch = coarsePointer

export const quality = {
  /** Shadow maps are the most expensive thing here; a phone GPU cannot spare them. */
  shadows: !isMobile,
  /** Cap device pixel ratio — a 3x iPhone screen would otherwise shade 9x the pixels. */
  maxDpr: isMobile ? 1.5 : 2,
  bloomIntensity: isMobile ? 0.55 : 0.75,
  /** Backdrop parallax is pure decoration, so it is the first thing to thin out. */
  backdropLayers: isMobile ? 1 : 3,
  /** Fewer scree chunks and crystals: they are the bulk of the terrain instances. */
  terrainDetail: isMobile ? 0.45 : 1,
}
