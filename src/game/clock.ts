// How far the renderer is through the current simulation tick, 0..1.
//
// The simulation advances in discrete ticks, and a driftling's `phase` only changes
// when one fires. Interpolating from `phase` alone therefore quantises movement to the
// tick rate — at 10Hz that is ten distinct positions a second however fast the display
// runs, which is exactly the stepping you can see. Adding this fraction gives the
// renderer sub-tick resolution, so motion is smooth at whatever the frame rate is.
//
// Lives outside React because it changes every frame and nothing should re-render.

let alpha = 0

export function setTickAlpha(a: number): void {
  alpha = a < 0 ? 0 : a > 1 ? 1 : a
}

export function tickAlpha(): number {
  return alpha
}
