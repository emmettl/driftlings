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
//
// The route is SERPENTINE rather than a single left-to-right corridor: when it runs
// out of width it drops to a lower band and doubles back the other way. That is what
// stops a level reading as a queue of obstacles — the driftling revisits the same
// column at different heights, the level occupies a space instead of a line, and the
// boundary walls do the turning for free (out of bounds is solid, so a walker that
// reaches the edge simply turns around).

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
  // Narrow and tall on purpose. The width has to run out before the beats do, or
  // the route never folds and the level is a corridor again with extra headroom.
  // Narrow enough that the route folds, wide enough that the folds do not stack so
  // tightly that upper bands short-circuit lower ones — and small enough that
  // verifying a candidate stays interactive. Bigger levels are dramatically more
  // expensive to solve, and generation runs on the UI thread.
  width: 40,
  height: 44,
  skillBeats: 5,
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
function fits(beat: Beat, gy: number, height: number, ceiling = 2): boolean {
  switch (beat) {
    case 'float':
      // Needs a drop longer than a driftling survives, and floor to land on.
      return gy + RULES.splatHeight + 2 <= height - 5
    case 'climb':
      // Needs headroom above for a face too tall to step up, without eating into the
      // band overhead.
      return gy - 3 >= ceiling
    case 'dig':
      // Needs a pit, its floor, and a landing platform beneath that.
      return gy + 3 + 10 < height
    case 'wall':
      // Needs a little headroom for the barrier and its anti-climber lip.
      return gy - 4 >= ceiling
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

  let x = 0
  let dir: 1 | -1 = 1
  let gy = rng.int(5, 8)
  // Upward beats must not chew into the band above, or a later fold overwrites an
  // earlier one and seals the route. This is the floor of the band overhead.
  let ceiling = 2
  const placed: Beat[] = []

  // Opening platform, and the entrance above it.
  const firstWidth = rng.int(7, 10)
  platform(g, x, x + firstWidth - 1, gy)
  g[Math.max(0, gy - 4)][x + 2] = 'E'
  x += firstWidth

  for (const wanted of beats) {
    const segWidth = rng.int(6, 9)

    // Out of width in the current direction? Fold the route down a band and reverse.
    // The driftling walks off the end of this platform, falls onto the band below,
    // carries on to the boundary wall, and turns — so the level doubles back on
    // itself instead of running off the edge of the world.
    const room = dir > 0 ? o.width - 1 - x : x
    if (room < segWidth + 2) {
      if (gy + 14 >= o.height - 6) break // no vertical room left; finish here
      // Bands need real separation: a climb or a dig spans several rows, and if the
      // next band sits too close the two overwrite each other.
      const dropTo = gy + rng.int(9, 12)
      const edge = dir > 0 ? o.width - 1 : 0
      const xs = Math.min(x, edge)
      const xe = Math.max(x, edge)
      platform(g, xs, xe, dropTo)
      ceiling = gy + 4
      gy = dropTo
      dir = (dir * -1) as 1 | -1
      // Resume from the far end of the landing strip, travelling the new way.
      x = dir > 0 ? xe + 1 : xs - 1
      placed.push('drop')
      continue
    }

    // A beat needs vertical room to be built as intended. Rather than silently
    // degrading a demand into free walking — which is what made levels drift down to
    // a single late decision — substitute another demand that does fit here.
    const feasible = SKILL_BEATS.filter((b) => fits(b, gy, o.height, ceiling))
    const beat = fits(wanted, gy, o.height, ceiling)
      ? wanted
      : feasible.length > 0
        ? feasible[rng.int(0, feasible.length - 1)]
        : 'drop'

    // Segment bounds in world coordinates, whichever way we are travelling.
    const xs = dir > 0 ? x : x - segWidth + 1
    const xe = dir > 0 ? x + segWidth - 1 : x

    switch (beat) {
      case 'step': {
        const ny = Math.max(ceiling, gy - 1)
        platform(g, xs, xe, ny)
        gy = ny
        break
      }
      case 'drop': {
        const ny = Math.min(o.height - 5, gy + rng.int(2, RULES.splatHeight - 2))
        platform(g, xs, xe, ny)
        gy = ny
        break
      }
      case 'float': {
        // Deliberately further than a driftling survives unaided.
        const ny = Math.min(o.height - 5, gy + RULES.splatHeight + rng.int(2, 4))
        platform(g, xs, xe, ny)
        gy = ny
        break
      }
      case 'climb': {
        // A sheer face too tall to step up. The whole segment is solid from the new
        // surface down past the old one, so whichever side we approach from is a wall.
        const ny = Math.max(ceiling, gy - rng.int(3, 6))
        fill(g, xs, ny, xe, gy + 2, '#')
        gy = ny
        break
      }
      case 'wall': {
        // An earth barrier two cells ahead, tall enough to defeat a step-up, with a
        // steel lip so a climber cannot mount it — otherwise a climber granted for
        // some other beat would clear this one too and force nothing.
        const t = rng.int(2, 3)
        platform(g, xs, xe, gy)
        const b0 = x + 2 * dir
        const b1 = b0 + (t - 1) * dir
        fill(g, Math.min(b0, b1), gy - 3, Math.max(b0, b1), gy - 1, '#')
        fill(g, Math.min(b0 - dir, b1 + dir), gy - 4, Math.max(b0 - dir, b1 + dir), gy - 4, '=')
        break
      }
      case 'dig': {
        // A pit the driftling drops into, walled in steel so the only way on is down.
        // The entry column must stay open, so the near wall sits one step back along
        // the approach, tucked under the platform it just left.
        const floorY = Math.min(o.height - 9, gy + rng.int(3, 5))
        const near = x - dir
        const far = dir > 0 ? xe : xs
        const pitS = Math.min(near, far)
        const pitE = Math.max(near, far)
        platform(g, pitS, pitE, floorY, 3)
        fill(g, near, floorY - 5, near, floorY - 1, '=')
        fill(g, far, floorY - 5, far, floorY - 1, '=')
        platform(g, pitS, pitE, Math.min(o.height - 4, floorY + 6))
        gy = Math.min(o.height - 4, floorY + 6)
        break
      }
    }

    placed.push(beat)
    x += segWidth * dir
  }

  // Closing platform with the exit on it, laid out in the direction of travel.
  const tailWidth = Math.max(5, Math.min(9, dir > 0 ? o.width - 1 - x : x))
  const tailS = dir > 0 ? x : x - tailWidth + 1
  const tailE = dir > 0 ? x + tailWidth - 1 : x
  platform(g, tailS, tailE, gy)
  const exitX = Math.max(1, Math.min(o.width - 2, dir > 0 ? tailE - 1 : tailS + 1))
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
