import { RULES, type SkillId } from '../sim/types'
import type { LevelSpec } from '../sim/world'
import { makeRng, type Rng } from './rng'

// Levels are built BACKWARDS FROM A SOLUTION rather than generated and then tested.
//
// We first decide the route a driftling will take — a sequence of "beats", each of
// which is either free (a step, a safe drop) or demands exactly one skill (a wall to
// bash, a cliff to climb, a lethal drop to float, a chamber to dig out of). Then we
// build the terrain that makes that route work, and grant exactly the skills the
// beats demand.
//
// Solvability is therefore true by construction; the solver's job is not to discover
// it but to police it — to catch shortcuts we did not intend, which is the failure
// mode this approach actually has.
//
// The beats are hand-authored idioms; the generator only composes and varies them.
// That is deliberate: taste in the vocabulary, machine scale in the arrangement.

export type Beat = 'step' | 'drop' | 'wall' | 'climb' | 'float' | 'dig'

/** Which skill each beat forces, if any. */
export const BEAT_SKILL: Record<Beat, SkillId | null> = {
  step: null,
  drop: null,
  wall: 'basher',
  climb: 'climber',
  float: 'floater',
  dig: 'digger',
}

const SKILL_BEATS: Beat[] = ['wall', 'climb', 'float', 'dig']

/** Traits that persist once granted — one is enough however many beats want it. */
export const PERMANENT: ReadonlySet<SkillId> = new Set<SkillId>(['climber', 'floater'])
const FREE_BEATS: Beat[] = ['step', 'drop']

export interface GenerateOptions {
  width?: number
  height?: number
  /** How many skill-demanding beats to aim for. */
  skillBeats?: number
  total?: number
  quota?: number
}

const DEFAULTS: Required<GenerateOptions> = {
  width: 64,
  height: 26,
  skillBeats: 3,
  total: 10,
  quota: 7,
}

type Grid = string[][]

function blank(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => '.'))
}

function fill(g: Grid, x0: number, y0: number, x1: number, y1: number, ch: string): void {
  for (let y = Math.max(0, y0); y <= y1 && y < g.length; y++) {
    for (let x = Math.max(0, x0); x <= x1 && x < g[0].length; x++) {
      g[y][x] = ch
    }
  }
}

/** A platform is a slab whose top surface is walkable at row `gy`. */
function platform(g: Grid, xs: number, xe: number, gy: number, thickness = 3): void {
  fill(g, xs, gy, xe, gy + thickness - 1, '#')
}

/**
 * Whether a beat can be built at this height with the room available. Checked up
 * front so a demand is swapped for another demand, never quietly downgraded into
 * free walking.
 */
function fits(beat: Beat, gy: number, height: number): boolean {
  switch (beat) {
    case 'float':
      // Needs a drop longer than a driftling survives, and floor to land on.
      return gy + RULES.splatHeight + 2 <= height - 5
    case 'climb':
      // Needs headroom above for a face too tall to step up.
      return gy - 3 >= 2
    case 'dig':
      // Needs a pit, its floor, and a landing platform beneath that.
      return gy + 3 + 10 < height
    case 'wall':
      // Needs a little headroom for the barrier and its anti-climber lip.
      return gy - 4 >= 1
    default:
      return true
  }
}

export interface GeneratedLevel {
  spec: LevelSpec
  seed: number
  beats: Beat[]
  /** Skills granted, i.e. the number the solver should be forced to spend. */
  intendedSkillCount: number
}

export function generateLevel(seed: number, options: GenerateOptions = {}): GeneratedLevel {
  const o = { ...DEFAULTS, ...options }
  const rng: Rng = makeRng(seed)
  const g = blank(o.width, o.height)

  // Plan the beat sequence: the requested skill beats, padded with a little free
  // walking, then shuffled so the demands are not all front-loaded.
  const beats: Beat[] = []
  for (let i = 0; i < o.skillBeats; i++) beats.push(rng.pick(SKILL_BEATS))
  const freeCount = rng.int(0, 2)
  for (let i = 0; i < freeCount; i++) beats.push(rng.pick(FREE_BEATS))
  for (let i = beats.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[beats[i], beats[j]] = [beats[j], beats[i]]
  }
  // Open on a demand rather than a stroll: a level whose first decision arrives
  // two-thirds of the way in reads as a corridor with a puzzle stapled to the end.
  const firstSkill = beats.findIndex((b) => BEAT_SKILL[b] !== null)
  if (firstSkill > 0) {
    ;[beats[0], beats[firstSkill]] = [beats[firstSkill], beats[0]]
  }

  const midY = Math.floor(o.height / 2)
  let x = 0
  let gy = rng.int(6, midY)
  const placed: Beat[] = []

  // Opening platform, and the entrance above it.
  const firstWidth = rng.int(7, 11)
  platform(g, x, x + firstWidth - 1, gy)
  const entranceX = x + 2
  g[Math.max(0, gy - 4)][entranceX] = 'E'
  x += firstWidth

  for (const wanted of beats) {
    const segWidth = rng.int(6, 10)
    // Stop cleanly if the next beat would not fit — a short honest level beats a
    // clipped one.
    if (x + segWidth + 6 >= o.width) break

    // A beat needs vertical room to be built as intended. Rather than silently
    // degrading a demand into free walking — which is what made levels drift down to
    // a single late decision — substitute another demand that does fit here.
    const beat = fits(wanted, gy, o.height)
      ? wanted
      : (SKILL_BEATS.filter((b) => fits(b, gy, o.height))[
          rng.int(0, Math.max(0, SKILL_BEATS.filter((b) => fits(b, gy, o.height)).length - 1))
        ] ?? wanted)

    switch (beat) {
      case 'step': {
        // A one-cell rise: walkable without any skill.
        const ny = Math.max(2, gy - 1)
        platform(g, x, x + segWidth - 1, ny)
        gy = ny
        break
      }
      case 'drop': {
        // A safe fall onto the next platform.
        const ny = Math.min(o.height - 5, gy + rng.int(2, RULES.splatHeight - 2))
        platform(g, x, x + segWidth - 1, ny)
        gy = ny
        break
      }
      case 'float': {
        // Deliberately further than a driftling survives unaided.
        const ny = Math.min(o.height - 5, gy + RULES.splatHeight + rng.int(2, 5))
        if (ny <= gy + RULES.splatHeight) {
          // No room to make it lethal — fall back to a plain drop.
          platform(g, x, x + segWidth - 1, ny)
          gy = ny
          placed.push('drop')
          x += segWidth
          continue
        }
        platform(g, x, x + segWidth - 1, ny)
        gy = ny
        break
      }
      case 'climb': {
        // A sheer face too tall to step up: only a climber gets over it.
        const rise = rng.int(3, 6)
        const ny = Math.max(2, gy - rise)
        if (gy - ny < 2) {
          platform(g, x, x + segWidth - 1, gy)
          placed.push('step')
          x += segWidth
          continue
        }
        // Solid from the new surface all the way down past the old one, so its left
        // face is a continuous wall.
        fill(g, x, ny, x + segWidth - 1, gy + 2, '#')
        gy = ny
        break
      }
      case 'wall': {
        // Same level, but an earth barrier tall enough to defeat a step-up.
        //
        // The lip matters: a climber is a *permanent* trait, so without an overhang a
        // single climber granted for some other beat would sail over this one too,
        // and the barrier would force nothing. An overhang above the climbing column
        // stops a climber dead (it cannot mount past a ceiling) while leaving the
        // basher's tunnel at head height untouched.
        const t = rng.int(2, 3)
        platform(g, x, x + segWidth - 1, gy)
        fill(g, x + 2, gy - 3, x + 2 + t - 1, gy - 1, '#')
        fill(g, x + 1, gy - 4, x + 2 + t, gy - 4, '=')
        break
      }
      case 'dig': {
        // A pit the driftling drops INTO, with steel walls it cannot climb out of and
        // earth underfoot — so the only way on is down, forcing a digger.
        //
        // The entry point matters: it falls straight down at the first column past the
        // previous platform, so that column must stay open. The left wall therefore
        // sits *under* the previous platform, not across the entrance.
        const floorY = Math.min(o.height - 8, gy + rng.int(3, 5))
        if (floorY <= gy + 2 || floorY + 10 >= o.height) {
          // Not enough headroom below — fall back to a plain drop.
          const ny = Math.min(o.height - 5, gy + 2)
          platform(g, x, x + segWidth - 1, ny)
          gy = ny
          placed.push('drop')
          x += segWidth
          continue
        }
        // Chamber floor (thick, so digging takes a while), spanning the entry column.
        platform(g, x - 1, x + segWidth - 1, floorY, 3)
        // Walls rising from the floor. The left one is at x-1, tucked beneath the
        // previous platform, leaving column x open to fall through.
        fill(g, x - 1, floorY - 5, x - 1, floorY - 1, '=')
        fill(g, x + segWidth - 1, floorY - 5, x + segWidth - 1, floorY - 1, '=')
        // Landing platform below, reached by digging out.
        const below = Math.min(o.height - 4, floorY + 6)
        platform(g, x - 1, x + segWidth + 3, below)
        gy = below
        break
      }
    }

    placed.push(beat)
    x += segWidth
  }

  // Closing platform with the exit on it.
  const tailWidth = Math.max(5, Math.min(10, o.width - x - 1))
  platform(g, x, x + tailWidth - 1, gy)
  const exitX = Math.min(o.width - 2, x + tailWidth - 2)
  g[gy - 1][exitX] = 'X'

  // Grant exactly the skills the beats demand — no spares. If a beat turns out not
  // to be forced, the solver will find the cheaper route and the level is rejected.
  //
  // Climber and floater are permanent traits: one grant covers every such beat in the
  // level, so they are counted once however many beats want them. Granting one each
  // per beat would make the level look under-solved and be rejected as a shortcut.
  const skills: Partial<Record<SkillId, number>> = {}
  for (const b of placed) {
    const s = BEAT_SKILL[b]
    if (!s) continue
    if (PERMANENT.has(s)) skills[s] = 1
    else skills[s] = (skills[s] ?? 0) + 1
  }
  const intendedSkillCount = Object.values(skills).reduce((a, b) => a + b, 0)

  return {
    seed,
    beats: placed,
    intendedSkillCount,
    spec: {
      name: `Drift ${seed}`,
      rows: g.map((r) => r.join('')),
      total: o.total,
      quota: o.quota,
      releaseRate: 20,
      skills,
    },
  }
}
