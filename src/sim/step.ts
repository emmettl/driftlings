import { belowFloor, build, carve, isDiggable, isExit, isSolid } from './terrain'
import { CELL, RULES, type Driftling, type SkillId, type World } from './types'

// One tick of the world. Pure in spirit — it mutates `world` in place for speed
// (the solver clones whole worlds), but depends on nothing outside it: no clock,
// no randomness. Same world in, same world out, every time.

/** Ticks between discrete steps for a driftling's current activity. */
export function stepPeriod(d: Driftling): number {
  return periodFor(d)
}

function periodFor(d: Driftling): number {
  switch (d.activity) {
    case 'walker':
      return RULES.walkPeriod
    case 'faller':
      return RULES.fallPeriod
    case 'climber':
      return RULES.climbPeriod
    case 'floater':
      return RULES.floatPeriod
    case 'bomber':
      return RULES.bombPeriod
    case 'builder':
      return RULES.buildPeriod
    case 'basher':
      return RULES.bashPeriod
    case 'miner':
      return RULES.minePeriod
    case 'digger':
      return RULES.digPeriod
    default:
      return RULES.walkPeriod
  }
}

function blockerAt(world: World, x: number, y: number, selfId: number): boolean {
  for (const o of world.driftlings) {
    if (o.id === selfId || o.activity !== 'blocker') continue
    // A blocker occupies its own cell and turns anyone entering it.
    if (o.x === x && o.y === y) return true
  }
  return false
}

function startFalling(d: Driftling): void {
  d.activity = d.isFloater ? 'floater' : 'faller'
  d.fallen = 0
  d.phase = 0
}

function land(world: World, d: Driftling): void {
  // A floater drifts down gently and never splats.
  if (d.activity === 'faller' && d.fallen > RULES.splatHeight) {
    d.activity = 'dead'
    world.lost += 1
    return
  }
  d.activity = 'walker'
  d.fallen = 0
  d.phase = 0
}

function stepWalker(world: World, d: Driftling): void {
  // Fall first: nothing underfoot wins over everything else.
  if (!isSolid(world, d.x, d.y + 1)) {
    startFalling(d)
    return
  }

  const nx = d.x + d.dir

  if (blockerAt(world, nx, d.y, d.id)) {
    d.dir = (d.dir * -1) as 1 | -1
    return
  }

  if (!isSolid(world, nx, d.y)) {
    d.x = nx
    if (!isSolid(world, d.x, d.y + 1)) startFalling(d)
    return
  }

  // Something ahead: step up a small ledge, climb it, or turn around.
  const canStepUp = !isSolid(world, nx, d.y - RULES.stepUp) && !isSolid(world, d.x, d.y - 1)
  if (canStepUp) {
    d.x = nx
    d.y -= RULES.stepUp
    return
  }

  if (d.isClimber) {
    d.activity = 'climber'
    d.phase = 0
    return
  }

  d.dir = (d.dir * -1) as 1 | -1
}

function stepFaller(world: World, d: Driftling): void {
  if (isSolid(world, d.x, d.y + 1)) {
    land(world, d)
    return
  }
  d.y += 1
  d.fallen += 1
  if (belowFloor(world, d.y)) {
    d.activity = 'dead'
    world.lost += 1
  }
}

function stepClimber(world: World, d: Driftling): void {
  const wallAhead = isSolid(world, d.x + d.dir, d.y)
  if (!wallAhead) {
    // Reached the top: mount the ledge.
    d.x += d.dir
    d.activity = 'walker'
    d.phase = 0
    return
  }
  if (isSolid(world, d.x, d.y - 1)) {
    // Overhang — can climb no further, drop back down facing away.
    d.dir = (d.dir * -1) as 1 | -1
    startFalling(d)
    return
  }
  d.y -= 1
}

function stepBasher(world: World, d: Driftling): void {
  // Nothing left to bash: the tunnel is through, resume walking.
  if (!isDiggable(world, d.x + d.dir, d.y)) {
    d.activity = 'walker'
    d.phase = 0
    return
  }
  carve(world, d.x + d.dir, d.y)
  carve(world, d.x + d.dir, d.y - 1) // head height, so the tunnel is passable
  d.x += d.dir
  if (!isSolid(world, d.x, d.y + 1)) startFalling(d)
}

function stepDigger(world: World, d: Driftling): void {
  if (!isDiggable(world, d.x, d.y + 1)) {
    d.activity = 'walker'
    d.phase = 0
    return
  }
  carve(world, d.x, d.y + 1)
  d.y += 1
}

function stepBuilder(world: World, d: Driftling): void {
  if (d.work <= 0 || isSolid(world, d.x + d.dir, d.y - 1)) {
    d.activity = 'walker'
    d.phase = 0
    return
  }

  // A one-cell stair: the brick is laid in front at foot height, then the builder
  // steps onto the new tread. Repeating this makes a clean 45° staircase.
  if (!build(world, d.x + d.dir, d.y)) {
    d.activity = 'walker'
    d.phase = 0
    return
  }
  d.x += d.dir
  d.y -= 1
  d.work -= 1
}

function stepMiner(world: World, d: Driftling): void {
  const nx = d.x + d.dir
  const ny = d.y + 1
  if (!isDiggable(world, nx, d.y) && !isDiggable(world, nx, ny)) {
    d.activity = 'walker'
    d.phase = 0
    return
  }
  carve(world, nx, d.y)
  carve(world, nx, ny)
  d.x = nx
  d.y = ny
}

function stepBomber(world: World, d: Driftling): void {
  d.work -= 1
  if (d.work > 0) return

  // Compact, readable blast: earth goes, steel and markers do not. The bomber is
  // sacrificed, as in the original vocabulary.
  for (let oy = -2; oy <= 2; oy++) {
    for (let ox = -2; ox <= 2; ox++) {
      if (Math.abs(ox) + Math.abs(oy) > 3) continue
      carve(world, d.x + ox, d.y + oy)
    }
  }
  d.activity = 'dead'
  world.lost += 1
}

/**
 * Advance one driftling by a single discrete step, ignoring tick pacing.
 *
 * This is the single definition of how a driftling moves. The game loop reaches it
 * through `stepWorld` (which adds tick periods and spawning); the solver calls it
 * directly, so a solution it finds cannot diverge from the game's actual rules.
 */
export function advanceDriftling(world: World, d: Driftling): void {
  switch (d.activity) {
    case 'walker':
      stepWalker(world, d)
      break
    case 'faller':
      stepFaller(world, d)
      break
    case 'floater':
      // Same descent, but harmless — handled by land().
      if (isSolid(world, d.x, d.y + 1)) {
        land(world, d)
      } else {
        d.y += 1
        if (belowFloor(world, d.y)) {
          d.activity = 'dead'
          world.lost += 1
        }
      }
      break
    case 'climber':
      stepClimber(world, d)
      break
    case 'bomber':
      stepBomber(world, d)
      break
    case 'builder':
      stepBuilder(world, d)
      break
    case 'basher':
      stepBasher(world, d)
      break
    case 'miner':
      stepMiner(world, d)
      break
    case 'digger':
      stepDigger(world, d)
      break
    case 'blocker':
      break // stands firm
    default:
      break
  }
}

export function stepWorld(world: World): void {
  if (world.finished) return
  world.tick += 1

  // Release from the entrance on a fixed cadence.
  if (world.spawned < world.total && world.tick % world.releaseRate === 0) {
    world.driftlings.push({
      id: world.nextId++,
      x: world.entrance.x,
      y: world.entrance.y,
      dir: 1,
      activity: 'faller',
      phase: 0,
      fallen: 0,
      prevX: world.entrance.x,
      prevY: world.entrance.y,
      isClimber: false,
      isFloater: false,
      work: 0,
    })
    world.spawned += 1
  }

  for (const d of world.driftlings) {
    if (d.activity === 'saved' || d.activity === 'dead') continue

    // Reaching the exit always wins, whatever they were doing.
    if (isExit(world, d.x, d.y)) {
      d.activity = 'saved'
      world.saved += 1
      continue
    }

    d.phase += 1
    if (d.phase < periodFor(d)) continue
    d.phase = 0
    // Remember where it was, so the renderer can animate the move rather than
    // snapping a whole cell at once.
    d.prevX = d.x
    d.prevY = d.y
    advanceDriftling(world, d)
  }

  const settled = world.driftlings.every((d) => d.activity === 'saved' || d.activity === 'dead')
  if (world.spawned >= world.total && settled) world.finished = true
}

/**
 * Whether a skill may be applied to this driftling right now — one definition,
 * shared by the UI, the game loop and the solver.
 */
export function canAssign(d: Driftling, skill: SkillId): boolean {
  if (d.activity === 'saved' || d.activity === 'dead') return false
  switch (skill) {
    case 'climber':
      return !d.isClimber
    case 'floater':
      return !d.isFloater
    case 'blocker':
    case 'bomber':
    case 'builder':
    case 'basher':
    case 'miner':
    case 'digger':
      return d.activity === 'walker'
    default:
      return false
  }
}

/** Apply a skill to a driftling. Assumes `canAssign` already passed. */
export function applySkill(d: Driftling, skill: SkillId): void {
  switch (skill) {
    case 'climber':
      d.isClimber = true
      break
    case 'floater':
      d.isFloater = true
      if (d.activity === 'faller') d.activity = 'floater'
      break
    case 'blocker':
      d.activity = 'blocker'
      break
    case 'bomber':
      d.activity = 'bomber'
      d.work = RULES.bombCountdown
      d.phase = 0
      break
    case 'builder':
      d.activity = 'builder'
      d.work = RULES.builderSteps
      d.phase = 0
      break
    case 'basher':
      d.activity = 'basher'
      d.phase = 0
      break
    case 'miner':
      d.activity = 'miner'
      d.phase = 0
      break
    case 'digger':
      d.activity = 'digger'
      d.phase = 0
      break
  }
}

/** Spend a skill from the world's inventory on a driftling. */
export function assignSkill(world: World, id: number, skill: SkillId): boolean {
  if ((world.skills[skill] ?? 0) <= 0) return false
  const d = world.driftlings.find((x) => x.id === id)
  if (!d || !canAssign(d, skill)) return false
  applySkill(d, skill)
  world.skills[skill] -= 1
  return true
}

export { CELL }
