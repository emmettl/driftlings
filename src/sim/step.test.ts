import { describe, expect, it } from 'vitest'
import { assignSkill, stepWorld } from './step'
import { cloneWorld, createWorld, hashWorld, type LevelSpec } from './world'
import { isSolid } from './terrain'
import { RULES, type Driftling, type World } from './types'
import { flatLevel, firstLevel } from '../levels/handmade'
import { attractStage } from '../levels/attract'

function run(w: World, ticks: number): World {
  for (let i = 0; i < ticks; i++) stepWorld(w)
  return w
}

function only(w: World): Driftling {
  const alive = w.driftlings.filter((d) => d.activity !== 'dead' && d.activity !== 'saved')
  return alive[0] ?? w.driftlings[0]
}

/** A one-driftling level built from ASCII, for isolating a single behaviour. */
function fixture(rows: string[], skills: LevelSpec['skills'] = {}): World {
  return createWorld({ name: 't', rows, total: 1, releaseRate: 1, quota: 1, skills })
}

describe('determinism', () => {
  it('two runs from the same start produce identical states', () => {
    const a = createWorld(firstLevel)
    const b = createWorld(firstLevel)
    for (let i = 0; i < 500; i++) {
      stepWorld(a)
      stepWorld(b)
    }
    expect(hashWorld(a)).toBe(hashWorld(b))
    expect(a.saved).toBe(b.saved)
    expect(a.lost).toBe(b.lost)
  })

  it('a clone diverges from its source only when acted on', () => {
    const w = createWorld(firstLevel)
    run(w, 120)
    const forked = cloneWorld(w)
    expect(hashWorld(forked)).toBe(hashWorld(w))

    run(w, 60)
    run(forked, 60)
    expect(hashWorld(forked)).toBe(hashWorld(w))
  })

  it('cloning does not alias terrain between worlds', () => {
    const w = fixture(['....', '.E..', '....', '####'])
    const forked = cloneWorld(w)
    forked.cells[0] = 1
    expect(w.cells[0]).toBe(0)
  })
})

describe('walking and falling', () => {
  it('falls to the floor and then walks', () => {
    const w = fixture(['..........', '....E.....', '..........', '..........', '##########'])
    run(w, 60)
    const d = only(w)
    expect(d.activity).toBe('walker')
    expect(isSolid(w, d.x, d.y + 1)).toBe(true)
  })

  it('turns around at a wall it cannot step up', () => {
    const w = fixture([
      '..........',
      '....E.....',
      '..........',
      '.......#..',
      '.......#..',
      '##########',
    ])
    run(w, 40)
    // Track the whole patrol: it must never breach the wall, and must reverse.
    const seen = new Set<number>()
    let maxX = 0
    for (let i = 0; i < 300; i++) {
      stepWorld(w)
      const d = only(w)
      seen.add(d.dir)
      maxX = Math.max(maxX, d.x)
    }
    expect(maxX).toBeLessThan(7) // never passed through
    expect(seen.has(1) && seen.has(-1)).toBe(true) // bounced both ways
    expect(only(w).activity).not.toBe('dead')
  })

  it('steps up a single-cell ledge without help', () => {
    const w = fixture(['..........', '.E........', '..........', '.....#####', '##########'])
    run(w, 200)
    const d = only(w)
    expect(d.activity).not.toBe('dead')
    expect(d.y).toBeLessThanOrEqual(3)
  })

  it('splats after falling further than the safe height', () => {
    const rows = ['....E.....', ...Array(RULES.splatHeight + 3).fill('..........'), '##########']
    const w = fixture(rows)
    run(w, 400)
    expect(only(w).activity).toBe('dead')
    expect(w.lost).toBe(1)
  })

  it('survives the same fall as a floater', () => {
    const rows = ['....E.....', ...Array(RULES.splatHeight + 3).fill('..........'), '##########']
    const w = fixture(rows, { floater: 1 })
    stepWorld(w) // release one
    expect(assignSkill(w, only(w).id, 'floater')).toBe(true)
    run(w, 400)
    expect(only(w).activity).not.toBe('dead')
    expect(w.lost).toBe(0)
  })
})

describe('skills', () => {
  it('a blocker turns another driftling around', () => {
    const w = createWorld({
      name: 'b',
      rows: ['..........', '.E........', '..........', '##########'],
      total: 2,
      releaseRate: 4,
      quota: 1,
      skills: { blocker: 1 },
    })
    run(w, 30)
    const first = w.driftlings[0]
    first.activity = 'walker'
    first.x = 5
    expect(assignSkill(w, first.id, 'blocker')).toBe(true)

    const second = w.driftlings[1]
    second.activity = 'walker'
    second.y = first.y
    second.x = 4
    second.dir = 1
    run(w, 20)
    expect(second.dir).toBe(-1) // bounced off the blocker
  })

  it('a basher tunnels through earth but not steel', () => {
    const w = fixture(['......', '.E....', '...##.', '######'], { basher: 1 })
    run(w, 20)
    const d = only(w)
    d.activity = 'walker'
    d.x = 2
    d.y = 2
    d.dir = 1
    expect(assignSkill(w, d.id, 'basher')).toBe(true)
    run(w, 60)
    expect(isSolid(w, 3, 2)).toBe(false) // earth removed

    const steel = fixture(['......', '.E....', '...==.', '######'], { basher: 1 })
    run(steel, 20)
    const s = only(steel)
    s.activity = 'walker'
    s.x = 2
    s.y = 2
    s.dir = 1
    assignSkill(steel, s.id, 'basher')
    run(steel, 60)
    expect(isSolid(steel, 3, 2)).toBe(true) // steel survives
  })

  it('a digger descends through earth', () => {
    const w = fixture(['......', '.E....', '..###.', '..###.', '######'], { digger: 1 })
    run(w, 30)
    const d = only(w)
    d.activity = 'walker'
    d.x = 3
    d.y = 1
    expect(assignSkill(w, d.id, 'digger')).toBe(true)
    const startY = d.y
    run(w, 60)
    expect(d.y).toBeGreaterThan(startY)
  })

  it('a builder lays a staircase and climbs it', () => {
    const w = fixture(['..........', '.E........', '..........', '..........', '##########'], {
      builder: 1,
    })
    run(w, 30)
    const d = only(w)
    d.activity = 'walker'
    d.x = 2
    d.y = 3
    expect(assignSkill(w, d.id, 'builder')).toBe(true)
    const startY = d.y
    run(w, RULES.buildPeriod * 4)
    expect(d.y).toBeLessThan(startY)
    expect(isSolid(w, 3, 3)).toBe(true)
  })

  it('a miner cuts diagonally down through earth', () => {
    const w = fixture(['........', '.E......', '...#####', '...#####', '########'], { miner: 1 })
    run(w, 20)
    const d = only(w)
    d.activity = 'walker'
    d.x = 2
    d.y = 1
    d.dir = 1
    expect(assignSkill(w, d.id, 'miner')).toBe(true)
    run(w, RULES.minePeriod * 2)
    expect(d.x).toBeGreaterThan(2)
    expect(d.y).toBeGreaterThan(1)
    expect(isSolid(w, 3, 2)).toBe(false)
  })

  it('a bomber removes nearby earth but not steel', () => {
    const w = fixture(['........', '.E......', '..#=#...', '########'], { bomber: 1 })
    run(w, 20)
    const d = only(w)
    d.activity = 'walker'
    d.x = 2
    d.y = 1
    expect(assignSkill(w, d.id, 'bomber')).toBe(true)
    run(w, RULES.bombPeriod * RULES.bombCountdown)
    expect(d.activity).toBe('dead')
    expect(isSolid(w, 2, 2)).toBe(false)
    expect(isSolid(w, 3, 2)).toBe(true)
  })

  it('a climber tops out at the ceiling instead of leaving the world', () => {
    // The side walls read as solid at every height, so a climber in the edge column
    // always has a wall ahead. With open sky above there was no overhang to stop it:
    // it climbed off the top of the level for ever, never landing, so the crowd never
    // settled and the level could not end. The world has a lid for this reason.
    const w = fixture(['......', '.E....', '......', '......', '######'], { climber: 1 })
    run(w, 30)
    const d = only(w)
    d.activity = 'walker'
    d.x = 0
    d.y = 3
    d.dir = -1
    expect(assignSkill(w, d.id, 'climber')).toBe(true)

    let highest = d.y
    for (let i = 0; i < 400; i++) {
      stepWorld(w)
      highest = Math.min(highest, d.y)
      expect(d.y).toBeGreaterThanOrEqual(0)
    }
    expect(highest).toBe(0) // reached the top row, and no further
    expect(d.activity).not.toBe('dead') // came back down under its own steam
  })

  it('refuses a skill with none left and does not overspend', () => {
    const w = fixture(['....', '.E..', '....', '####'], { blocker: 1 })
    run(w, 30)
    const d = only(w)
    d.activity = 'walker'
    expect(assignSkill(w, d.id, 'blocker')).toBe(true)
    expect(w.skills.blocker).toBe(0)
    expect(assignSkill(w, d.id, 'blocker')).toBe(false)
    expect(w.skills.blocker).toBe(0)
  })
})

describe('the attract arena', () => {
  // The title screen hands out skills at random for the comedy of it, and nothing on
  // it may ever die. That has broken twice — once when a climber escaped over the top
  // of the world, once when a digger opened a shaft under the entrance and every
  // driftling released afterwards fell the full height of the arena. Both were only
  // ever caught by watching. This asserts the property instead, per skill, so a future
  // change to the arena's shape cannot quietly reintroduce it.
  it.each(['blocker', 'builder', 'digger', 'miner', 'floater', 'basher', 'climber'] as const)(
    'loses nobody when everyone is handed %s',
    (skill) => {
      const w = createWorld(attractStage)
      for (let t = 0; t < 1500; t++) {
        stepWorld(w)
        // Far more aggressive than the screen itself, which grants one every 26 ticks.
        for (const d of w.driftlings) {
          if (d.activity === 'walker') assignSkill(w, d.id, skill)
        }
        for (const s of Object.keys(w.skills) as (keyof typeof w.skills)[]) w.skills[s] = 99
      }
      expect(w.lost).toBe(0)
    },
  )

  it('is short enough that a fall from the ceiling is survivable', () => {
    // The invariant the arena's shape rests on. Guaranteeing each drop separately does
    // not hold, because a digger can excavate a clear shaft from the lid to the floor,
    // so the worst case is always "fell the entire interior".
    const w = createWorld(attractStage)
    const column = 15 // the entrance column: the shaft a digger is most likely to open
    let floorTop = w.height
    for (let y = 0; y < w.height; y++) {
      if (isSolid(w, column, y)) {
        floorTop = y
        break
      }
    }
    expect(floorTop).toBeLessThan(w.height) // there is a floor at all
    expect(floorTop - 1).toBeLessThanOrEqual(RULES.splatHeight) // and it is close enough
  })
})

describe('objectives', () => {
  it('counts a driftling that reaches the exit as saved', () => {
    const w = createWorld(flatLevel)
    run(w, 400)
    expect(w.saved).toBe(1)
    expect(w.lost).toBe(0)
  })

  it('finishes once everyone is settled', () => {
    const w = createWorld(flatLevel)
    run(w, 600)
    expect(w.finished).toBe(true)
  })

  it('never loses track of a driftling', () => {
    const w = createWorld(firstLevel)
    run(w, 2000)
    const accounted = w.driftlings.filter(
      (d) => d.activity === 'saved' || d.activity === 'dead',
    ).length
    expect(w.saved + w.lost).toBe(accounted)
    expect(w.spawned).toBe(firstLevel.total)
  })
})
