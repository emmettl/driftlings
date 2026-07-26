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
    // Every drop is inside the survivable fall height, so nobody ever dies here —
    // they just wander, get in each other's way, and occasionally fall off something.
    '=..............................=',
    '=..............E...............=',
    '=..............................=',
    '=..............................=',
    '=.......################.......=',
    '=.......################.......=',
    '=..............................=',
    '=..............................=',
    '=..####................####....=',
    '=..####................####....=',
    '=..............................=',
    '=..............................=',
    // Steel, not earth: a digger handed a spade on an earth floor tunnels straight
    // out of the world and dies, which rather spoils the joke.
    '================================',
    '================================',
    '================================',
    '================================',
  ],
}
