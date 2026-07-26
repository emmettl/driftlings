import type { LevelSpec } from '../sim/world'

// The first hand-made level. Deliberately simple and legible: a drop from the
// entrance, a walk, a wall that needs bashing, and a pit you must not fall into.
// It exists so the sim and (next) the solver have ground truth to work against
// before any generator is written.

export const firstLevel: LevelSpec = {
  name: 'First Light',
  total: 10,
  releaseRate: 20,
  quota: 8,
  skills: { basher: 2, blocker: 2, floater: 2, climber: 2, digger: 2 },
  rows: [
    '....................................................',
    '..........E.........................................',
    '....................................................',
    '....................................................',
    '....................................................',
    '.....#########......................................',
    '.....#########......................................',
    '.....#########............########..................',
    '.....#########............########..................',
    '.....#########............########..................',
    '.....#########............########..........X.......',
    '.....##################...########...###############',
    '.....##################...########...###############',
    '.....##################...########...###############',
    '=====================================================',
  ],
}

// A minimal fixture for tests that want a flat floor and nothing else.
export const flatLevel: LevelSpec = {
  name: 'Flat',
  total: 1,
  releaseRate: 1,
  quota: 1,
  skills: {},
  rows: [
    '..........',
    '....E.....',
    '..........',
    '..........',
    '.......X..',
    '##########',
  ],
}
