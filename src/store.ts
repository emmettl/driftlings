import { create } from 'zustand'
import { assignSkill, stepWorld } from './sim/step'
import { createWorld } from './sim/world'
import type { SkillId, World } from './sim/types'
import { firstLevel } from './levels/handmade'
import { findLevel } from './generator/verify'
import type { LevelSpec } from './sim/world'
import pack from './levels/pack.json'

// Levels are curated offline (npm run curate) and shipped as a pack, so picking one
// is instant. Generating in the browser meant a several-hundred-millisecond freeze on
// the UI thread, and capped level size at whatever stayed interactive.
const PACK: { seed: number; spec: LevelSpec }[] = (pack.levels ?? []) as never

// The world is mutated in place by the sim (the solver will fork it thousands of
// times, so it must stay cheap). React therefore can't diff it — `revision` is the
// signal that something changed.

interface GameState {
  world: World
  /** The level currently loaded — hand-made at first, generated on request. */
  spec: LevelSpec
  /** Set when the level came from the generator, for the HUD to show. */
  seed: number | null
  generating: boolean
  revision: number
  selected: SkillId | null
  cameraMode: 'follow' | 'overview'
  paused: boolean
  speed: number
  tick: () => void
  select: (s: SkillId | null) => void
  applyTo: (id: number) => void
  reset: () => void
  togglePause: () => void
  toggleCamera: () => void
  setSpeed: (n: number) => void
  newGenerated: () => void
}

export const useGame = create<GameState>()((set, get) => ({
  world: createWorld(firstLevel),
  spec: firstLevel,
  seed: null,
  generating: false,
  revision: 0,
  selected: null,
  cameraMode: 'follow',
  paused: false,
  speed: 1,

  tick: () => {
    const { world, paused } = get()
    if (paused || world.finished) return
    stepWorld(world)
    set({ revision: get().revision + 1 })
  },

  select: (s) => set({ selected: get().selected === s ? null : s }),

  applyTo: (id) => {
    const { world, selected } = get()
    if (!selected) return
    if (assignSkill(world, id, selected)) {
      set({ revision: get().revision + 1 })
      // Deselect once the last of a skill is spent, so the toolbar can't lie.
      if (world.skills[selected] <= 0) set({ selected: null })
    }
  },

  reset: () =>
    set({ world: createWorld(get().spec), revision: 0, selected: null, paused: false }),

  newGenerated: () => {
    set({ generating: true })
    const current = get().seed
    let spec: LevelSpec
    let seed: number | null

    if (PACK.length > 0) {
      // Walk the curated pack, which is ordered easiest-first.
      const at = PACK.findIndex((l) => l.seed === current)
      const next = PACK[(at + 1) % PACK.length]
      spec = next.spec
      seed = next.seed
    } else {
      // No pack built yet: fall back to generating live, which is slower but keeps
      // the game playable from a fresh clone.
      const found = findLevel({ startSeed: (current ?? 0) + 1, attempts: 40 })
      spec = found.level?.spec ?? firstLevel
      seed = found.level?.seed ?? null
    }

    set({
      spec,
      seed,
      world: createWorld(spec),
      revision: 0,
      selected: null,
      paused: false,
      generating: false,
    })
  },

  togglePause: () => set({ paused: !get().paused }),
  toggleCamera: () =>
    set({ cameraMode: get().cameraMode === 'follow' ? 'overview' : 'follow' }),
  setSpeed: (n) => set({ speed: n }),
}))
