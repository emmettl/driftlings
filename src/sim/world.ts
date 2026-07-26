import { idx } from './terrain'
import { CELL, SKILL_IDS, type SkillId, type World } from './types'

// Levels are authored as ASCII art. It is readable in a diff, trivial to write by
// hand, and — once the generator exists — is exactly what it will emit, so humans
// and the machine speak the same format.
//
//   '#' earth (diggable)   '=' steel (indestructible)   '.' or ' ' air
//   'E' entrance           'X' exit

export interface LevelSpec {
  name: string
  rows: string[]
  total: number
  releaseRate: number
  skills: Partial<Record<SkillId, number>>
  /** How many must be saved to pass. */
  quota: number
}

export function createWorld(spec: LevelSpec): World {
  const height = spec.rows.length
  const width = Math.max(...spec.rows.map((r) => r.length))
  const cells = new Uint8Array(width * height)
  let entrance = { x: 0, y: 0 }
  let exit = { x: 0, y: 0 }

  for (let y = 0; y < height; y++) {
    const row = spec.rows[y]
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.'
      const at = y * width + x
      switch (ch) {
        case '#':
          cells[at] = CELL.EARTH
          break
        case '=':
          cells[at] = CELL.STEEL
          break
        case 'E':
          cells[at] = CELL.ENTRANCE
          entrance = { x, y }
          break
        case 'X':
          cells[at] = CELL.EXIT
          exit = { x, y }
          break
        default:
          cells[at] = CELL.EMPTY
      }
    }
  }

  const skills = {} as Record<SkillId, number>
  for (const id of SKILL_IDS) skills[id] = spec.skills[id] ?? 0

  return {
    width,
    height,
    cells,
    driftlings: [],
    tick: 0,
    nextId: 1,
    entrance,
    exit,
    spawned: 0,
    total: spec.total,
    saved: 0,
    lost: 0,
    skills,
    releaseRate: spec.releaseRate,
    finished: false,
  }
}

/** Deep copy — the solver forks worlds constantly, so this must stay cheap. */
export function cloneWorld(w: World): World {
  return {
    width: w.width,
    height: w.height,
    cells: w.cells.slice(),
    driftlings: w.driftlings.map((d) => ({ ...d })),
    tick: w.tick,
    nextId: w.nextId,
    entrance: { ...w.entrance },
    exit: { ...w.exit },
    spawned: w.spawned,
    total: w.total,
    saved: w.saved,
    lost: w.lost,
    skills: { ...w.skills },
    releaseRate: w.releaseRate,
    finished: w.finished,
  }
}

/**
 * A compact, order-independent signature of the world. The solver uses this to
 * recognise states it has already explored — terrain is part of the state, since
 * bashers and diggers reshape it.
 */
export function hashWorld(w: World): string {
  let terrain = 0
  for (let i = 0; i < w.cells.length; i++) {
    terrain = (terrain * 31 + w.cells[i]) | 0
  }
  const bodies = w.driftlings
    .filter((d) => d.activity !== 'dead' && d.activity !== 'saved')
    .map((d) => `${d.x},${d.y},${d.dir},${d.activity},${d.isClimber ? 1 : 0}${d.isFloater ? 1 : 0}`)
    .sort()
    .join('|')
  const skills = SKILL_IDS.map((s) => w.skills[s]).join(',')
  return `${terrain}#${bodies}#${skills}#${w.saved}#${w.spawned}`
}

export function renderAscii(w: World): string[] {
  const out: string[] = []
  for (let y = 0; y < w.height; y++) {
    let row = ''
    for (let x = 0; x < w.width; x++) {
      const c = w.cells[idx(w, x, y)]
      row +=
        c === CELL.EARTH ? '#' : c === CELL.STEEL ? '=' : c === CELL.EXIT ? 'X' : c === CELL.ENTRANCE ? 'E' : '.'
    }
    out.push(row)
  }
  // Overlay live driftlings so a failing test prints something a human can read.
  for (const d of w.driftlings) {
    if (d.activity === 'dead' || d.activity === 'saved') continue
    if (d.y < 0 || d.y >= w.height || d.x < 0 || d.x >= w.width) continue
    const row = out[d.y]
    out[d.y] = row.slice(0, d.x) + (d.activity === 'blocker' ? 'B' : 'o') + row.slice(d.x + 1)
  }
  return out
}
