import { create } from 'zustand'
import { assignSkill, stepWorld } from './sim/step'
import { createWorld } from './sim/world'
import type { SkillId, World } from './sim/types'
import { firstLevel } from './levels/handmade'

// The world is mutated in place by the sim (the solver will fork it thousands of
// times, so it must stay cheap). React therefore can't diff it — `revision` is the
// signal that something changed.

interface GameState {
  world: World
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
}

export const useGame = create<GameState>()((set, get) => ({
  world: createWorld(firstLevel),
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
    set({ world: createWorld(firstLevel), revision: 0, selected: null, paused: false }),

  togglePause: () => set({ paused: !get().paused }),
  setSpeed: (n) => set({ speed: n }),
}))
