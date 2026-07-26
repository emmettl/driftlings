import { assignSkill, stepWorld } from '../sim/step'
import { createWorld, type LevelSpec } from '../sim/world'
import type { PlanEntry } from './solve'
import type { SkillId } from '../sim/types'

// The solver proves ONE driftling can reach the exit. The level is won by saving a
// quota of them. Those are not the same claim, and the gap between them is where the
// crowd lives: followers spawn behind the pioneer and walk the same way, but they
// walk into the hazards the pioneer's route was carefully steered around.
//
// This runs the real tick-based simulation with the whole crowd, applying the
// pioneer's plan to the first driftling out, and reports what actually happens.

export interface CrowdPlacement {
  /** Tick at which to apply the skill. */
  tick: number
  skill: SkillId
  /** Which driftling, by spawn order (0 = the pioneer). */
  nth: number
}

export interface CrowdResult {
  saved: number
  lost: number
  spawned: number
  finished: boolean
  ticks: number
  /** Plan entries the rules refused at the moment they were scheduled. */
  rejected: number
}

export interface CrowdOptions {
  /** Extra skills applied to specific driftlings at specific ticks (e.g. blockers). */
  placements?: CrowdPlacement[]
  maxTicks?: number
  /**
   * Traits to hand to every driftling as it appears, while stock lasts — the obvious
   * thing a competent player does with a per-driftling trait like float or climb.
   * Terrain skills need no equivalent: a tunnel, once dug, serves everyone.
   */
  autoTraits?: SkillId[]
}

export function runCrowd(
  spec: LevelSpec,
  plan: PlanEntry[],
  options: CrowdOptions = {},
): CrowdResult {
  const maxTicks = options.maxTicks ?? 6000
  const world = createWorld(spec)

  // The pioneer is simply the first driftling released.
  const pending = [...plan].sort((a, b) => a.step - b.step)
  let pioneerId: number | null = null
  let pioneerSteps = 0
  let rejected = 0

  const placements = [...(options.placements ?? [])].sort((a, b) => a.tick - b.tick)
  let nextPlacement = 0

  for (let t = 0; t < maxTicks && !world.finished; t++) {
    if (pioneerId === null && world.driftlings.length > 0) pioneerId = world.driftlings[0].id
    const pioneer = world.driftlings.find((d) => d.id === pioneerId)

    // The plan is indexed by the pioneer's own steps, not by ticks, because that is
    // the frame the solver searched in.
    if (pioneer) {
      while (pending.length > 0 && pending[0].step === pioneerSteps) {
        const entry = pending.shift()!
        if (!assignSkill(world, pioneer.id, entry.skill)) rejected += 1
      }
    }

    // Crowd-management skills are scheduled against the clock instead.
    while (nextPlacement < placements.length && placements[nextPlacement].tick === t) {
      const p = placements[nextPlacement++]
      const target = world.driftlings[p.nth]
      if (!target || !assignSkill(world, target.id, p.skill)) rejected += 1
    }

    // Hand out per-driftling traits to anyone who has just appeared without one.
    for (const trait of options.autoTraits ?? []) {
      for (const d of world.driftlings) {
        if (world.skills[trait] <= 0) break
        const has = trait === 'floater' ? d.isFloater : trait === 'climber' ? d.isClimber : true
        if (!has && d.activity !== 'dead' && d.activity !== 'saved') {
          assignSkill(world, d.id, trait)
        }
      }
    }

    stepWorld(world)

    // A driftling steps on the tick its phase wraps back to zero.
    const after = world.driftlings.find((d) => d.id === pioneerId)
    if (after && after.phase === 0) pioneerSteps += 1
  }

  return {
    saved: world.saved,
    lost: world.lost,
    spawned: world.spawned,
    finished: world.finished,
    ticks: world.tick,
    rejected,
  }
}
