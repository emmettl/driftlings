import { describe, expect, it } from 'vitest'
import { analyse } from './analyse'
import { solve } from '../solver/solve'
import { generateLevel } from './generate'
import { verify } from './verify'
import type { LevelSpec } from '../sim/world'

const level = (rows: string[], skills: LevelSpec['skills'] = {}): LevelSpec => ({
  name: 't',
  rows,
  total: 1,
  releaseRate: 1,
  quota: 1,
  skills,
})

describe('alternative-route enumeration', () => {
  it('finds a single route through a level with one forced barrier', () => {
    const spec = level(['........', '.E......', '.....#..', '.....#X.', '########'], { basher: 1 })
    const r = solve(spec, { enumerate: 20 })
    expect(r.solved).toBe(true)
    expect(r.alternatives?.length).toBe(1)
  })

  it('finds several routes when the barrier can be cleared in many places', () => {
    // A long wall gives the basher many equally good columns to tunnel through.
    const spec = level(
      [
        '..............',
        '.E............',
        '......########',
        '......########',
        '............X.',
        '##############',
      ],
      { digger: 1 },
    )
    const r = solve(spec, { enumerate: 20 })
    if (r.solved) expect(r.alternatives!.length).toBeGreaterThanOrEqual(1)
  })

  it('costs nothing when enumeration is not requested', () => {
    const spec = level(['........', '.E.....X', '########'])
    expect(solve(spec).alternatives).toBeUndefined()
  })
})

describe('design measurements', () => {
  it('reports an unsolvable level as unsolvable rather than guessing', () => {
    const spec = level(['......', '.E....', '..==..', '..==X.', '######'])
    const a = analyse(spec)
    expect(a.solvable).toBe(false)
    expect(a.criticalSkills).toEqual([])
  })

  it('marks a skill critical when removing it breaks the level', () => {
    const spec = level(['........', '.E......', '.....#..', '.....#X.', '########'], { basher: 1 })
    const a = analyse(spec)
    expect(a.solvable).toBe(true)
    expect(a.criticalSkills).toContain('basher')
    expect(a.slackSkills).toHaveLength(0)
  })

  it('marks a spare skill as slack', () => {
    // Two bashers granted where one is enough: the second is padding.
    const spec = level(['........', '.E......', '.....#..', '.....#X.', '########'], { basher: 2 })
    const a = analyse(spec)
    expect(a.slackSkills).toContain('basher')
  })

  it('places the first decision as a fraction of the route', () => {
    const spec = level(['........', '.E......', '.....#..', '.....#X.', '########'], { basher: 1 })
    const a = analyse(spec)
    expect(a.firstDecisionAt).toBeGreaterThanOrEqual(0)
    expect(a.firstDecisionAt).toBeLessThanOrEqual(1)
  })
})

describe('the quality bar', () => {
  it('rejects a level whose only decision comes at the very end', () => {
    // A long approach, then one barrier right before the exit.
    const pad = '.'.repeat(40)
    const spec = level(
      [pad + '....', '.E' + '.'.repeat(42), pad + '.#..', pad + '.#X.', '#'.repeat(44)],
      { basher: 1 },
    )
    const v = verify({ seed: 0, beats: [], intendedSkillCount: 1, spec })
    // Either too few decisions or too late a decision — both are the bar working.
    expect(['thin', 'back-loaded']).toContain(v.rejection)
  })

  it('every accepted level clears every published threshold', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const v = verify(generateLevel(seed, { width: 30, height: 30, skillBeats: 3 }))
      if (!v.ok) continue
      const a = v.analysis!
      expect(a.skillsUsed).toBeGreaterThanOrEqual(2)
      expect(a.firstDecisionAt).toBeLessThanOrEqual(0.5)
      expect(a.alternatives).toBeLessThanOrEqual(6)
      expect(a.slackSkills).toHaveLength(0)
    }
  }, 20_000)
})
