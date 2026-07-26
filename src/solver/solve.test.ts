import { describe, expect, it } from 'vitest'
import { solve } from './solve'
import { replay } from './replay'
import type { LevelSpec } from '../sim/world'
import { firstLevel } from '../levels/handmade'

const level = (rows: string[], skills: LevelSpec['skills'] = {}): LevelSpec => ({
  name: 't',
  rows,
  total: 1,
  releaseRate: 1,
  quota: 1,
  skills,
})

describe('trivially walkable levels', () => {
  it('solves a flat walk to the exit with no skills', () => {
    const spec = level(['..........', '.E........', '..........', '.......X..', '##########'])
    const r = solve(spec)
    expect(r.solved).toBe(true)
    expect(r.skillsUsed).toBe(0)
  })

  it('reports unreachable when the exit is sealed behind steel', () => {
    const spec = level(
      ['........', '.E......', '.....=..', '.....=X.', '########'],
      { basher: 2, digger: 2 },
    )
    const r = solve(spec)
    expect(r.solved).toBe(false)
    expect(r.reason).toBe('unreachable')
  })
})

describe('levels that require a specific skill', () => {
  it('needs a basher to get through an earth wall', () => {
    const rows = ['........', '.E......', '.....#..', '.....#X.', '########']
    // Without the skill there is no route.
    expect(solve(level(rows, {})).solved).toBe(false)
    // With it, there is — and it costs exactly one.
    const r = solve(level(rows, { basher: 1 }))
    expect(r.solved).toBe(true)
    expect(r.skillsUsed).toBe(1)
    expect(r.plan.map((p) => p.skill)).toContain('basher')
  })

  it('needs a digger to get through a floor', () => {
    const rows = [
      '........',
      '.E......',
      '........',
      '#####.##',
      '#####.##',
      '.....X..',
      '########',
    ]
    const r = solve(level(rows, { digger: 1 }))
    expect(r.solved).toBe(true)
  })

  it('finds the cheapest route when several would work', () => {
    const rows = ['........', '.E......', '.....#..', '.....#X.', '########']
    const r = solve(level(rows, { basher: 3, digger: 3, climber: 3, floater: 3 }))
    expect(r.solved).toBe(true)
    // A generous inventory must not tempt it into a wasteful route.
    expect(r.skillsUsed).toBe(1)
  })
})

describe('the hand-made level', () => {
  it('is solvable, and the route survives an independent replay', () => {
    const r = solve(firstLevel)
    expect(r.solved).toBe(true)

    const check = replay(firstLevel, r.plan)
    expect(check.rejected).toBeUndefined()
    expect(check.died).toBe(false)
    expect(check.reachedExit).toBe(true)
  })

  it('reports its search cost, so generation can be budgeted', () => {
    const r = solve(firstLevel)
    expect(r.expansions).toBeGreaterThan(0)
    expect(r.visited).toBeGreaterThan(0)
  })
})

describe('solver honesty', () => {
  it('never returns a plan it cannot replay', () => {
    const specs = [
      level(['........', '.E.....X', '########']),
      level(['........', '.E......', '.....#..', '.....#X.', '########'], { basher: 1 }),
      firstLevel,
    ]
    for (const spec of specs) {
      const r = solve(spec)
      if (!r.solved) continue
      const check = replay(spec, r.plan)
      expect(check.reachedExit).toBe(true)
      expect(check.rejected).toBeUndefined()
    }
  })

  it('respects the expansion budget instead of hanging', () => {
    const r = solve(firstLevel, { maxExpansions: 5 })
    expect(r.solved).toBe(false)
    expect(r.reason).toBe('budget-exhausted')
    expect(r.expansions).toBeLessThanOrEqual(6)
  })

  it('never spends a skill it does not have', () => {
    const rows = ['........', '.E......', '.....#..', '.....#X.', '########']
    const r = solve(level(rows, { basher: 1 }))
    const bashers = r.plan.filter((p) => p.skill === 'basher').length
    expect(bashers).toBeLessThanOrEqual(1)
  })
})
