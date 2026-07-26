import { advanceDriftling, applySkill, canAssign } from '../sim/step'
import { createWorld, type LevelSpec } from '../sim/world'
import { isExit } from '../sim/terrain'
import { CELL, SKILL_IDS, type Activity, type Driftling, type SkillId, type World } from '../sim/types'

// Route solver: can ONE driftling get from the entrance to the exit, and with which
// skills? That is the load-bearing question for level generation — in a level where
// everyone spawns at the same place, a route that works for one works for the crowd.
// (Crowd management — blockers holding others back — is a separate layer on top.)
//
// It searches over discrete driftling steps rather than ticks. Tick periods only
// control how fast a step happens, not which step happens, so for a single driftling
// the trajectory is identical while the state space is far smaller.
//
// Crucially it moves the driftling with the game's own `advanceDriftling`, so a route
// it finds is a route the real game will reproduce.

export interface SolverNode {
  x: number
  y: number
  dir: 1 | -1
  activity: Activity
  climber: boolean
  floater: boolean
  fallen: number
  /** Terrain cells removed so far, ascending. Usually tiny, so cheap to copy+hash. */
  carved: number[]
  skills: Record<SkillId, number>
}

export interface PlanEntry {
  /** Step index at which the skill is applied, before that step is taken. */
  step: number
  skill: SkillId
  x: number
  y: number
}

export interface SolveResult {
  solved: boolean
  /** Why it stopped, when unsolved. */
  reason?: 'unreachable' | 'budget-exhausted'
  plan: PlanEntry[]
  skillsUsed: number
  steps: number
  /** Search effort — the honest cost signal for tuning generation. */
  expansions: number
  /** Distinct reachable states seen. */
  visited: number
  /**
   * Distinct minimum-skill routes found, when `enumerate` was requested. One means a
   * tightly forced level; many means the puzzle is mushy.
   */
  alternatives?: PlanEntry[][]
}

export interface SolveOptions {
  /** Hard cap on node expansions so a pathological level cannot hang the caller. */
  maxExpansions?: number
  /** Cap on steps in any single route, to bound wandering. */
  maxSteps?: number
  /**
   * Keep searching past the first solution and collect distinct routes that use the
   * same (minimum) number of skills, up to this many. A level with one forced route
   * plays very differently from one with a dozen — this is how we tell them apart.
   */
  enumerate?: number
}

const DEFAULTS: Required<SolveOptions> = {
  maxExpansions: 200_000,
  maxSteps: 600,
  enumerate: 0,
}

/** Identity of a route by where its skills are spent, ignoring incidental timing. */
function planSignature(plan: PlanEntry[]): string {
  return plan
    .map((p) => `${p.skill}@${p.x},${p.y}`)
    .sort()
    .join('|')
}

// --- tiny binary heap, ordered by (skills used, steps) ------------------------

interface QueueItem {
  node: SolverNode
  plan: PlanEntry[]
  steps: number
  cost: number
}

class Heap {
  private items: QueueItem[] = []

  get size(): number {
    return this.items.length
  }

  push(item: QueueItem): void {
    const a = this.items
    a.push(item)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (a[p].cost <= a[i].cost) break
      ;[a[p], a[i]] = [a[i], a[p]]
      i = p
    }
  }

  pop(): QueueItem | undefined {
    const a = this.items
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop()!
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = l + 1
        let s = i
        if (l < a.length && a[l].cost < a[s].cost) s = l
        if (r < a.length && a[r].cost < a[s].cost) s = r
        if (s === i) break
        ;[a[s], a[i]] = [a[i], a[s]]
        i = s
      }
    }
    return top
  }
}

// --- state <-> world plumbing -------------------------------------------------

function keyOf(n: SolverNode): string {
  return `${n.x},${n.y},${n.dir},${n.activity},${n.climber ? 1 : 0}${n.floater ? 1 : 0},${
    n.fallen
  },${n.carved.join('.')},${SKILL_IDS.map((s) => n.skills[s]).join('')}`
}

/** Load a node into the scratch world so the real rules can be applied to it. */
function load(world: World, base: Uint8Array, n: SolverNode, d: Driftling): void {
  world.cells.set(base)
  for (const i of n.carved) world.cells[i] = CELL.EMPTY
  d.x = n.x
  d.y = n.y
  d.dir = n.dir
  d.activity = n.activity
  d.isClimber = n.climber
  d.isFloater = n.floater
  d.fallen = n.fallen
  d.phase = 0
}

/** Read the scratch world back out, recording any newly carved cells. */
function capture(world: World, base: Uint8Array, d: Driftling, skills: SolverNode['skills']): SolverNode {
  const carved: number[] = []
  for (let i = 0; i < base.length; i++) {
    if (base[i] !== CELL.EMPTY && world.cells[i] === CELL.EMPTY) carved.push(i)
  }
  return {
    x: d.x,
    y: d.y,
    dir: d.dir,
    activity: d.activity,
    climber: d.isClimber,
    floater: d.isFloater,
    fallen: d.fallen,
    carved,
    skills: { ...skills },
  }
}

export function solve(spec: LevelSpec, options: SolveOptions = {}): SolveResult {
  const opts = { ...DEFAULTS, ...options }
  const world = createWorld(spec)
  const base = world.cells.slice() // pristine terrain; nodes carry their diffs

  // One scratch driftling, reused for every expansion.
  const scratch: Driftling = {
    id: 1,
    x: world.entrance.x,
    y: world.entrance.y,
    dir: 1,
    activity: 'faller',
    phase: 0,
    fallen: 0,
    isClimber: false,
    isFloater: false,
  }
  world.driftlings = [scratch]

  const start: SolverNode = {
    x: world.entrance.x,
    y: world.entrance.y,
    dir: 1,
    activity: 'faller',
    climber: false,
    floater: false,
    fallen: 0,
    carved: [],
    skills: { ...world.skills },
  }

  const open = new Heap()
  const seen = new Set<string>([keyOf(start)])
  open.push({ node: start, plan: [], steps: 0, cost: 0 })

  let expansions = 0
  // Enumeration bookkeeping: the first solution fixes the minimum skill count, and
  // we then keep collecting routes that match it until the frontier gets pricier.
  const found: PlanEntry[][] = []
  const foundSigs = new Set<string>()
  let best: { plan: PlanEntry[]; steps: number; used: number } | null = null

  while (open.size > 0) {
    const current = open.pop()!
    const n = current.node

    if (expansions++ >= opts.maxExpansions) {
      return {
        solved: false,
        reason: 'budget-exhausted',
        plan: [],
        skillsUsed: 0,
        steps: 0,
        expansions,
        visited: seen.size,
      }
    }

    // Goal: standing on the exit.
    load(world, base, n, scratch)
    if (isExit(world, n.x, n.y)) {
      const used = SKILL_IDS.reduce((sum, s) => sum + (start.skills[s] - n.skills[s]), 0)
      if (!best) best = { plan: current.plan, steps: current.steps, used }

      if (opts.enumerate <= 0) {
        return {
          solved: true,
          plan: current.plan,
          skillsUsed: used,
          steps: current.steps,
          expansions,
          visited: seen.size,
        }
      }

      // Collect distinct routes at the same skill cost as the best one.
      if (used === best.used) {
        const sig = planSignature(current.plan)
        if (!foundSigs.has(sig)) {
          foundSigs.add(sig)
          found.push(current.plan)
        }
      }
      if (used > best.used || found.length >= opts.enumerate) break
      continue
    }

    // Once enumerating, anything pricier than the best cannot be an alternative.
    if (best && opts.enumerate > 0) {
      const usedHere = SKILL_IDS.reduce((sum, s) => sum + (start.skills[s] - n.skills[s]), 0)
      if (usedHere > best.used) break
    }

    if (n.activity === 'dead' || current.steps >= opts.maxSteps) continue

    // Successors: take the next step as-is, or spend a skill first.
    const choices: { skill: SkillId | null }[] = [{ skill: null }]
    for (const s of SKILL_IDS) {
      if (n.skills[s] > 0) choices.push({ skill: s })
    }

    for (const choice of choices) {
      load(world, base, n, scratch)

      const skills = { ...n.skills }
      let plan = current.plan
      if (choice.skill) {
        if (!canAssign(scratch, choice.skill)) continue
        applySkill(scratch, choice.skill)
        skills[choice.skill] -= 1
        plan = [...current.plan, { step: current.steps, skill: choice.skill, x: n.x, y: n.y }]
      }

      // A blocker can never move again — a dead end for a route search.
      if (scratch.activity === 'blocker') continue

      advanceDriftling(world, scratch)
      if (scratch.activity === 'dead') continue

      const next = capture(world, base, scratch, skills)
      const key = keyOf(next)
      if (seen.has(key)) continue
      seen.add(key)

      const steps = current.steps + 1
      const used = SKILL_IDS.reduce((sum, s) => sum + (start.skills[s] - next.skills[s]), 0)
      // Prefer routes that spend fewer skills; break ties by fewer steps.
      open.push({ node: next, plan, steps, cost: used * 10_000 + steps })
    }
  }

  if (best) {
    return {
      solved: true,
      plan: best.plan,
      skillsUsed: best.used,
      steps: best.steps,
      expansions,
      visited: seen.size,
      alternatives: found,
    }
  }

  return {
    solved: false,
    reason: 'unreachable',
    plan: [],
    skillsUsed: 0,
    steps: 0,
    expansions,
    visited: seen.size,
    alternatives: opts.enumerate > 0 ? [] : undefined,
  }
}
