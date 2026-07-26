import { runCrowd, type CrowdPlacement, type CrowdResult } from './crowd'
import type { LevelSpec } from '../sim/world'
import type { PlanEntry } from './solve'

// The blocker is the one skill the route solver cannot reason about, because it does
// nothing for the driftling that becomes it — it exists to turn OTHER driftlings
// around. It is therefore a crowd-level question, not a route-level one, and it is
// answered by simulation rather than search: place a blocker, run the whole crowd,
// count who got home.
//
// That sidesteps a full multi-agent search. We are not asking "what is the optimal
// multi-agent plan"; we are asking the much narrower question the generator needs:
// "is there a blocker placement that rescues this level, and does the level need one?"

export interface BlockerSearch {
  /** Best placement found, if any helped. */
  placement?: CrowdPlacement
  /** How the crowd fares with no blocker at all. */
  without: CrowdResult
  /** How it fares with the best placement. */
  with?: CrowdResult
  /** Crowd sims run — this search is simulation-bound, so it is worth reporting. */
  trials: number
}

export interface BlockerOptions {
  /** Which driftlings to consider blocking with, by release order. */
  candidates?: number[]
  /** Tick grid to try. Coarse on purpose: a blocker is useful over a window. */
  tickStep?: number
  maxTick?: number
}

/**
 * Look for a blocker placement that gets more of the crowd home. Returns the best one
 * found, along with the no-blocker baseline so a caller can tell whether the level
 * actually *needs* it or merely tolerates it.
 */
export function findBlocker(
  spec: LevelSpec,
  plan: PlanEntry[],
  options: BlockerOptions = {},
): BlockerSearch {
  const candidates = options.candidates ?? [1, 2]
  const tickStep = options.tickStep ?? 24
  const maxTick = options.maxTick ?? 720

  const traits = (['climber', 'floater'] as const).filter((s) => (spec.skills[s] ?? 0) > 0)
  const without = runCrowd(spec, plan, { autoTraits: traits })
  if ((spec.skills.blocker ?? 0) <= 0) return { without, trials: 0 }

  let best: { placement: CrowdPlacement; result: CrowdResult } | undefined
  let trials = 0

  for (const nth of candidates) {
    for (let tick = tickStep; tick <= maxTick; tick += tickStep) {
      const placement: CrowdPlacement = { tick, nth, skill: 'blocker' }
      const result = runCrowd(spec, plan, { autoTraits: traits, placements: [placement] })
      trials += 1
      if (!best || result.saved > best.result.saved) best = { placement, result }
      // Nothing left to improve on.
      if (best.result.saved >= spec.total) break
    }
    if (best && best.result.saved >= spec.total) break
  }

  if (!best || best.result.saved <= without.saved) return { without, trials }
  return { placement: best.placement, without, with: best.result, trials }
}
