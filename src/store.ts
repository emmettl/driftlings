import { create } from 'zustand'
import { assignSkill, stepWorld } from './sim/step'
import { createWorld } from './sim/world'
import type { SkillId, World } from './sim/types'
import { firstLevel } from './levels/handmade'
import { findLevel } from './generator/verify'
import type { LevelSpec } from './sim/world'

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
  paused: boolean
  speed: number
  tick: () => void
  select: (s: SkillId | null) => void
  applyTo: (id: number) => void
  reset: () => void
  togglePause: () => void
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
    // Search seeds until one passes the solver's gate, so a level is never served
    // to the player without a proof that it can actually be finished.
    const startSeed = (get().seed ?? 0) + 1
    const found = findLevel({ startSeed, attempts: 80 })
    const spec = found.level?.spec ?? firstLevel
    set({
      spec,
      seed: found.level?.seed ?? null,
      world: createWorld(spec),
      revision: 0,
      selected: null,
      paused: false,
      generating: false,
    })
  },

  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (n) => set({ speed: n }),
}))
