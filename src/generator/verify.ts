import { solve, type SolveResult } from '../solver/solve'
import { replay } from '../solver/replay'
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

export interface Verdict {
  ok: boolean
  rejection?: Rejection
  /** Skills the beats intended to force. */
  intended: number
  /** Skills the solver actually needed. */
  required: number
  result: SolveResult
}

export function verify(level: GeneratedLevel): Verdict {
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

  return { ...base, ok: true }
}

export interface SearchOptions extends GenerateOptions {
  /** Seeds to try before giving up. */
  attempts?: number
  startSeed?: number
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
    const verdict = verify(level)
    if (verdict.ok) return { level, verdict, attempts: i + 1, rejections }
    rejections[verdict.rejection ?? 'unknown'] = (rejections[verdict.rejection ?? 'unknown'] ?? 0) + 1
  }

  return { level: null, verdict: null, attempts, rejections }
}
