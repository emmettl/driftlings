import { solve, type SolveResult } from '../solver/solve'
import { replay } from '../solver/replay'
import { analyse, type Analysis } from './analyse'
import { runCrowd, type CrowdResult } from '../solver/crowd'
import { generateLevel, type GenerateOptions, type GeneratedLevel } from './generate'

// The generator builds levels it *believes* are solvable. This is where that belief
// is tested. Building backwards from a solution guarantees a route exists; what it
// cannot guarantee is that the route is the ONLY one — an accidental shortcut makes
// a level trivial, and that is the failure mode worth policing.

export type Rejection =
  | 'unsolvable' // the construction is broken
  | 'trivial' // reachable with no skills at all
  | 'shortcut' // a cheaper route than intended exists
  | 'replay-failed' // solver found a route the sim will not walk
  | 'thin' // only one decision in the whole level
  | 'back-loaded' // nothing to do until most of the level is behind you
  | 'mushy' // so many routes work that no choice matters
  | 'unwinnable' // one driftling can finish, but the quota never can

export interface QualityBar {
  /** Fewer decisions than this and it is a walk, not a puzzle. */
  minSkills: number
  /** The first decision must arrive within this fraction of the route. */
  maxFirstDecisionAt: number
  /** More distinct minimum-skill routes than this and nothing is really forced. */
  maxAlternatives: number
  /**
   * The crowd, not just the pioneer, must get home. A level where only the one
   * driftling the solver traced can finish is not a level.
   */
  minSaved: number
}

export const DEFAULT_BAR: QualityBar = {
  minSkills: 2,
  maxFirstDecisionAt: 0.5,
  maxAlternatives: 6,
  minSaved: 3,
}

export interface Verdict {
  ok: boolean
  rejection?: Rejection
  /** Skills the beats intended to force. */
  intended: number
  /** Skills the solver actually needed. */
  required: number
  result: SolveResult
  /** Design measurements, present once the level is known to be solvable. */
  analysis?: Analysis
  /** What actually happens when the whole crowd is released. */
  crowd?: CrowdResult
}

export function verify(level: GeneratedLevel, bar: QualityBar = DEFAULT_BAR): Verdict {
  // Compare against the skills actually granted, not the beat count — climber and
  // floater are permanent, so several beats can share one grant.
  const intended = level.intendedSkillCount
  const result = solve(level.spec, { maxExpansions: 300_000 })

  const base = { intended, required: result.skillsUsed, result }

  if (!result.solved) return { ...base, ok: false, rejection: 'unsolvable' }

  // The solver's route must be one the game will actually walk.
  const walked = replay(level.spec, result.plan)
  if (!walked.reachedExit) return { ...base, ok: false, rejection: 'replay-failed' }

  if (result.skillsUsed === 0) return { ...base, ok: false, rejection: 'trivial' }

  // Fewer skills needed than beats placed means a beat was not actually forced —
  // the terrain left a way around it.
  if (result.skillsUsed < intended) return { ...base, ok: false, rejection: 'shortcut' }

  // Correctness is settled; now ask whether it is any good.
  const analysis = analyse(level.spec)
  const scored = { ...base, analysis }

  if (analysis.skillsUsed < bar.minSkills) return { ...scored, ok: false, rejection: 'thin' }
  if (analysis.firstDecisionAt > bar.maxFirstDecisionAt) {
    return { ...scored, ok: false, rejection: 'back-loaded' }
  }
  if (analysis.alternatives > bar.maxAlternatives) {
    return { ...scored, ok: false, rejection: 'mushy' }
  }

  // Finally: release everyone. The solver only ever proved a single route, and a
  // level is won by a quota — those are different claims, and the difference is
  // exactly where per-driftling traits and hazards bite.
  const crowd = runCrowd(level.spec, result.plan, { autoTraits: level.traits })
  const withCrowd = { ...scored, crowd }
  if (crowd.saved < bar.minSaved) return { ...withCrowd, ok: false, rejection: 'unwinnable' }

  // Ask for what the level can actually deliver, keeping a little slack for mistakes.
  level.spec.quota = Math.max(1, crowd.saved - 1)

  return { ...withCrowd, ok: true }
}

export interface SearchOptions extends GenerateOptions {
  /** Seeds to try before giving up. */
  attempts?: number
  startSeed?: number
  bar?: QualityBar
}

export interface SearchOutcome {
  level: GeneratedLevel | null
  verdict: Verdict | null
  attempts: number
  /** Why the rejected candidates were rejected — the generator's report card. */
  rejections: Record<string, number>
}

/** Generate seeds until one passes the gate. */
export function findLevel(options: SearchOptions = {}): SearchOutcome {
  const attempts = options.attempts ?? 60
  const start = options.startSeed ?? 1
  const rejections: Record<string, number> = {}

  for (let i = 0; i < attempts; i++) {
    const level = generateLevel(start + i, options)
    const verdict = verify(level, options.bar ?? DEFAULT_BAR)
    if (verdict.ok) return { level, verdict, attempts: i + 1, rejections }
    rejections[verdict.rejection ?? 'unknown'] = (rejections[verdict.rejection ?? 'unknown'] ?? 0) + 1
  }

  return { level: null, verdict: null, attempts, rejections }
}
