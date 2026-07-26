import { stepPeriod } from '../sim/step'
import type { Driftling } from '../sim/types'
import { tickAlpha } from './clock'

// Where a driftling should be drawn *right now*, between the cell it left and the one
// it is in. The simulation is integer-cell by design — the solver depends on it — so
// this is the one place that turns discrete state into continuous position.
//
// It has to be shared. When the renderer interpolated but the camera followed the raw
// integer position, the camera lurched a whole cell at a time while its subject glided
// smoothly, which reads as jerky the moment you are zoomed in far enough for one cell
// to matter.

/** Smoothstep, so a step eases in and out rather than starting and stopping abruptly. */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

export function smoothX(d: Driftling): number {
  const t = ease(Math.min(1, (d.phase + tickAlpha()) / stepPeriod(d)))
  return d.prevX + (d.x - d.prevX) * t
}

export function smoothY(d: Driftling): number {
  const t = ease(Math.min(1, (d.phase + tickAlpha()) / stepPeriod(d)))
  return d.prevY + (d.y - d.prevY) * t
}
