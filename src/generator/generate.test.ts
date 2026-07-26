import { describe, expect, it } from 'vitest'
import { generateLevel } from './generate'
import { findLevel, verify } from './verify'
import { solve } from '../solver/solve'
import { replay } from '../solver/replay'
import { createWorld } from '../sim/world'

describe('generation is reproducible', () => {
  it('gives byte-identical levels for the same seed', () => {
    const a = generateLevel(42)
    const b = generateLevel(42)
    expect(a.spec.rows).toEqual(b.spec.rows)
    expect(a.spec.skills).toEqual(b.spec.skills)
    expect(a.beats).toEqual(b.beats)
  })

  it('gives different levels for different seeds', () => {
    const a = generateLevel(1).spec.rows.join('\n')
    const b = generateLevel(2).spec.rows.join('\n')
    expect(a).not.toBe(b)
  })
})

describe('every generated level is structurally sound', () => {
  it('always has exactly one entrance and one exit', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const text = generateLevel(seed).spec.rows.join('')
      expect([...text].filter((c) => c === 'E')).toHaveLength(1)
      expect([...text].filter((c) => c === 'X')).toHaveLength(1)
    }
  })

  it('builds a world without throwing, at the requested size', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const spec = generateLevel(seed, { width: 50, height: 22 }).spec
      const w = createWorld(spec)
      expect(w.width).toBe(50)
      expect(w.height).toBe(22)
    }
  })
})

describe('the quality gate', () => {
  it('accepts only levels that are solvable, non-trivial and fully forced', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const level = generateLevel(seed)
      const v = verify(level)
      if (!v.ok) continue
      // Everything the gate promises must actually hold.
      expect(v.result.solved).toBe(true)
      expect(v.required).toBeGreaterThan(0) // not walkable for free
      expect(v.required).toBe(v.intended) // no beat was bypassed
      expect(replay(level.spec, v.result.plan).reachedExit).toBe(true)
    }
  })

  it('rejects a level whose exit can be strolled to', () => {
    // Hand-built trivial level: flat walk, no obstacle.
    const flat = {
      seed: 0,
      beats: [],
      intendedSkillCount: 0,
      spec: {
        name: 'flat',
        rows: ['..........', '.E........', '.......X..', '##########'],
        total: 1,
        releaseRate: 1,
        quota: 1,
        skills: {},
      },
    }
    expect(verify(flat).rejection).toBe('trivial')
  })

  it('grants only one climber however many beats want climbing', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { spec } = generateLevel(seed, { skillBeats: 4 })
      expect(spec.skills.climber ?? 0).toBeLessThanOrEqual(1)
      expect(spec.skills.floater ?? 0).toBeLessThanOrEqual(1)
    }
  })
})

describe('finding a playable level', () => {
  it('returns a verified level within a modest number of attempts', () => {
    const outcome = findLevel({ startSeed: 1, attempts: 30 })
    expect(outcome.level).not.toBeNull()
    expect(outcome.verdict?.ok).toBe(true)
    expect(outcome.attempts).toBeLessThanOrEqual(30)
  })

  it('yields levels the solver can walk end to end', () => {
    for (const startSeed of [1, 100, 500]) {
      const { level } = findLevel({ startSeed, attempts: 40 })
      expect(level).not.toBeNull()
      const r = solve(level!.spec)
      expect(r.solved).toBe(true)
      expect(replay(level!.spec, r.plan).reachedExit).toBe(true)
    }
  })

  it(
    'keeps the acceptance rate healthy',
    () => {
      // A regression guard on generation quality: if a change to the beats or the
      // rules starts producing junk, this drops and the build says so. It is a floor,
      // not a target — full verification now includes the design analysis, which
      // re-solves the level once per granted skill, so this is deliberately a small
      // sample.
      let ok = 0
      const n = 30
      for (let seed = 1; seed <= n; seed++) {
        if (verify(generateLevel(seed)).ok) ok++
      }
      expect(ok / n).toBeGreaterThan(0.4)
    },
    20_000,
  )
})
