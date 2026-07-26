import type { LevelSpec } from '../sim/world'

// The stage the attract screen runs on. It is a sealed arena rather than a level:
// steel walls at both ends so nobody can wander out, a couple of ledges to fall off,
// and no exit at all — the point is that they never get anywhere.
//
// It is played by the real simulation, so what you watch on the title screen is
// genuine behaviour rather than an animation of it. The comedy is free: a crowd of
// them pacing into a blocker and turning round is just what the rules do.

export const attractStage: LevelSpec = {
  name: 'Attract',
  total: 24,
  releaseRate: 14,
  quota: 0,
  skills: { blocker: 99, digger: 99, floater: 99, climber: 99, basher: 99 },
  rows: [
    // Nobody may ever die here, and the only version of that promise which actually
    // holds is a geometric one: the whole interior is shorter than the survivable
    // fall. Guaranteeing it platform by platform does not work, because a digger can
    // open a clear shaft from the entrance to the floor — which is exactly what used
    // to happen. Someone dug through the wide ledge directly under the entrance, and
    // every driftling released after that fell the full height of the arena and
    // splatted. Nine rows of headroom, floor to lid, and no drop can be fatal however
    // much of the place gets excavated.
    //
    // It is also what lets a climber join in: it tops out against the lid and drops
    // back from the ceiling, which is the tallest fall available and still survivable.
    '=..............................=',
    '=..............E...............=',
    '=..............................=',
    '=.......################.......=',
    '=.......################.......=',
    '=..............................=',
    '=..####................####....=',
    '=..####................####....=',
    '=..............................=',
    // Steel, not earth: a digger handed a spade on an earth floor tunnels straight
    // out of the world and dies, which rather spoils the joke. Kept to three rows —
    // it only has to be thick enough to read as a floor, and the shorter arena frames
    // tighter, so any more of it just fills the shot with plating.
    '================================',
    '================================',
    '================================',
  ],
}
