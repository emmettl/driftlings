// The simulation is deliberately integer-only and tick-driven: no floats, no
// Math.random, no wall-clock time. Two runs from the same start state must produce
// byte-identical results, because the whole project rests on being able to replay
// and search over it (the solver explores thousands of futures per second).

export const CELL = {
  EMPTY: 0,
  EARTH: 1, // diggable / bashable
  STEEL: 2, // indestructible
  EXIT: 3,
  ENTRANCE: 4,
} as const

export type CellKind = (typeof CELL)[keyof typeof CELL]

export type SkillId = 'climber' | 'floater' | 'blocker' | 'basher' | 'digger'

export const SKILL_IDS: SkillId[] = ['climber', 'floater', 'blocker', 'basher', 'digger']

/** What a driftling is currently doing. */
export type Activity =
  | 'walker'
  | 'faller'
  | 'climber'
  | 'floater'
  | 'blocker'
  | 'basher'
  | 'digger'
  | 'saved'
  | 'dead'

export interface Driftling {
  id: number
  x: number // cell coords, y grows downward
  y: number
  dir: 1 | -1
  activity: Activity
  /** Ticks accumulated toward this activity's next discrete step. */
  phase: number
  /** Cells fallen in the current descent — drives splat damage. */
  fallen: number
  /** Permanent traits, kept separate from the current activity. */
  isClimber: boolean
  isFloater: boolean
}

export interface World {
  readonly width: number
  readonly height: number
  /** Row-major terrain, mutated in place by bashers/diggers. */
  cells: Uint8Array
  driftlings: Driftling[]
  tick: number
  nextId: number

  entrance: { x: number; y: number }
  exit: { x: number; y: number }

  spawned: number
  total: number
  saved: number
  lost: number

  skills: Record<SkillId, number>
  /** Ticks between releases at the entrance. */
  releaseRate: number
  finished: boolean
}

export const RULES = {
  /** Ticks per discrete step, per activity. Lower = faster. */
  walkPeriod: 4,
  fallPeriod: 2,
  climbPeriod: 5,
  floatPeriod: 5,
  bashPeriod: 6,
  digPeriod: 6,
  /** Falling further than this without a floater is fatal. */
  splatHeight: 9,
  /** A walker steps up a ledge this tall; anything higher is a wall. */
  stepUp: 1,
}
