import pack from '../src/levels/pack.json'
import { solve } from '../src/solver/solve'
import { runCrowd } from '../src/solver/crowd'
import type { LevelSpec } from '../src/sim/world'

// The shipped level pack is a curated artefact of the rules, so a change to the rules
// can silently invalidate it — the levels are verified once, offline, and then trusted
// for ever. Adding a ceiling to the world did exactly that to one of the forty.
//
// This re-proves every shipped level against the CURRENT rules: still solvable, and
// the crowd still meets the quota the pack claims. Run it after touching anything in
// src/sim or src/solver.

const levels = (pack as { levels: { seed: number; spec: LevelSpec }[] }).levels
let broken = 0

for (const { seed, spec } of levels) {
  const result = solve(spec)
  if (!result.plan) {
    console.error(`seed ${seed}: no longer solvable`)
    broken++
    continue
  }
  const traits = (['climber', 'floater'] as const).filter((s) => (spec.skills[s] ?? 0) > 0)
  const crowd = runCrowd(spec, result.plan, { autoTraits: traits })
  if (crowd.saved < spec.quota) {
    console.error(`seed ${seed}: quota ${spec.quota}, crowd saves ${crowd.saved}`)
    broken++
  }
}

if (broken > 0) {
  console.error(`${broken} of ${levels.length} shipped levels are invalid — re-run npm run curate`)
  process.exitCode = 1
} else {
  console.log(`all ${levels.length} shipped levels still valid`)
}
