import { solve } from '../solver/solve'
import type { LevelSpec } from '../sim/world'
import { SKILL_IDS, type SkillId } from '../sim/types'
import { PERMANENT } from './generate'

// "Solvable" is a low bar. These are the measurements that try to get at whether a
// level is any *good* — the questions a designer would ask, asked mechanically.
//
// None of this claims to measure fun. It measures properties that fun tends to need:
// that the level is tightly forced rather than mushy, that the first real decision
// arrives before the player has lost interest, and that each granted skill is load
// bearing.

export interface Analysis {
  solvable: boolean
  steps: number
  skillsUsed: number

  /**
   * How many distinct minimum-skill routes exist. 1 = one forced solution; large
   * numbers mean the level tolerates almost anything, which reads as mush.
   */
  alternatives: number

  /**
   * Where the first skill is spent, as a fraction of the route. Low is good: a level
   * whose only decision is at the very end is a corridor with a puzzle stapled on.
   */
  firstDecisionAt: number

  /** How spread out the decisions are across the route (0 = all bunched, 1 = even). */
  decisionSpread: number

  /** Skills that, if removed, make the level unsolvable. Should be all of them. */
  criticalSkills: SkillId[]
  /** Granted but not load bearing — the level would survive without them. */
  slackSkills: SkillId[]
}

const NO_ANALYSIS: Analysis = {
  solvable: false,
  steps: 0,
  skillsUsed: 0,
  alternatives: 0,
  firstDecisionAt: 1,
  decisionSpread: 0,
  criticalSkills: [],
  slackSkills: [],
}

export function analyse(spec: LevelSpec): Analysis {
  // Enumeration is the expensive half of this. Ten distinct routes is well past the
  // point where a level counts as mushy, so there is nothing to learn by finding more.
  const base = solve(spec, { maxExpansions: 300_000, enumerate: 10 })
  if (!base.solved) return NO_ANALYSIS

  const steps = Math.max(1, base.steps)
  const at = base.plan.map((p) => p.step / steps).sort((a, b) => a - b)

  // Spread: mean gap between consecutive decisions, normalised. One decision counts
  // as no spread at all.
  let spread = 0
  if (at.length > 1) {
    let gaps = 0
    for (let i = 1; i < at.length; i++) gaps += at[i] - at[i - 1]
    spread = gaps / (at.length - 1)
  }

  // Criticality: take each granted skill away in turn and see whether the level
  // survives. A skill nobody needs is padding.
  const critical: SkillId[] = []
  const slack: SkillId[] = []
  for (const s of SKILL_IDS) {
    const granted = spec.skills[s] ?? 0
    if (granted <= 0) continue
    // A blocker does nothing for the driftling that becomes it — it exists to turn
    // OTHER driftlings around. It is therefore never load bearing for a route, and
    // route-level analysis would always call it slack. Whether the level actually
    // needs one is a crowd question, answered by the blocker search instead.
    if (s === 'blocker' || s === 'bomber') continue
    // Per-driftling traits are stocked per head so the whole crowd can follow, so
    // taking one away proves nothing — ask whether the level needs the trait at all.
    // For terrain skills, taking one away is exactly the question: is this a spare?
    const reduced = PERMANENT.has(s) ? 0 : granted - 1
    const without: LevelSpec = { ...spec, skills: { ...spec.skills, [s]: reduced } }
    if (solve(without, { maxExpansions: 200_000 }).solved) slack.push(s)
    else critical.push(s)
  }

  return {
    solvable: true,
    steps: base.steps,
    skillsUsed: base.skillsUsed,
    alternatives: base.alternatives?.length ?? 1,
    firstDecisionAt: at.length > 0 ? at[0] : 1,
    decisionSpread: spread,
    criticalSkills: critical,
    slackSkills: slack,
  }
}
