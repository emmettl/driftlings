import { advanceDriftling, applySkill, canAssign } from '../sim/step'
import { createWorld, type LevelSpec } from '../sim/world'
import { isExit } from '../sim/terrain'
import type { Driftling } from '../sim/types'
import type { PlanEntry } from './solve'

// Independent check that a plan actually works: walk one driftling from the entrance
// applying the plan's skills at the recorded steps, and see whether it reaches the
// exit. The solver searches; this only replays — so it can catch a solver that has
// convinced itself of a route it cannot actually walk.

export interface ReplayResult {
  reachedExit: boolean
  steps: number
  died: boolean
  /** A skill the plan asked for that the rules refused at that moment. */
  rejected?: PlanEntry
}

export function replay(spec: LevelSpec, plan: PlanEntry[], maxSteps = 2000): ReplayResult {
  const world = createWorld(spec)
  const d: Driftling = {
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
  world.driftlings = [d]

  const byStep = new Map<number, PlanEntry[]>()
  for (const p of plan) {
    const list = byStep.get(p.step) ?? []
    list.push(p)
    byStep.set(p.step, list)
  }

  for (let step = 0; step < maxSteps; step++) {
    if (isExit(world, d.x, d.y)) return { reachedExit: true, steps: step, died: false }
    if (d.activity === 'dead') return { reachedExit: false, steps: step, died: true }

    for (const entry of byStep.get(step) ?? []) {
      if (!canAssign(d, entry.skill)) {
        return { reachedExit: false, steps: step, died: false, rejected: entry }
      }
      applySkill(d, entry.skill)
    }

    if (d.activity === 'blocker') break // will never move again
    advanceDriftling(world, d)
  }

  return { reachedExit: isExit(world, d.x, d.y), steps: maxSteps, died: d.activity === 'dead' }
}
