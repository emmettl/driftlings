import { create } from 'zustand'
import { assignSkill, stepWorld } from './sim/step'
import { createWorld } from './sim/world'
import type { SkillId, World } from './sim/types'
import { firstLevel } from './levels/handmade'
import { findLevel } from './generator/verify'
import type { LevelSpec } from './sim/world'
import pack from './levels/pack.json'
import {
  setSoundtrackMuted,
  soundLost,
  soundSaved,
  soundSkill,
  startSoundtrack,
  updateSoundtrack,
} from './game/audio'

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
  /** The title screen runs until the player begins. */
  phase: 'attract' | 'playing'
  selected: SkillId | null
  /** 'follow' tracks the action, 'overview' frames the level, 'manual' obeys the map. */
  cameraMode: 'follow' | 'overview' | 'manual'
  /** Where the player has panned to, in cell coordinates. */
  focus: { x: number; y: number } | null
  /** The driftling under inspection: highlighted, followed, and the target of the bar. */
  watching: number | null
  paused: boolean
  muted: boolean
  speed: number
  tick: () => void
  select: (s: SkillId | null) => void
  applyTo: (id: number) => void
  reset: () => void
  startPlaying: () => void
  togglePause: () => void
  toggleMuted: () => void
  toggleCamera: () => void
  panTo: (x: number, y: number) => void
  watch: (id: number | null) => void
  applySkillToWatched: (skill: SkillId) => void
  setSpeed: (n: number) => void
  cycleSpeed: () => void
  zoom: (direction: 'in' | 'out') => void
  newGenerated: () => void
}

export const useGame = create<GameState>()((set, get) => ({
  world: createWorld(firstLevel),
  spec: firstLevel,
  seed: null,
  generating: false,
  revision: 0,
  phase: 'attract',
  selected: null,
  cameraMode: 'follow',
  focus: null,
  watching: null,
  paused: false,
  muted: false,
  speed: 1,

  tick: () => {
    const { world, paused } = get()
    if (paused || world.finished) return
    const saved = world.saved
    const lost = world.lost
    stepWorld(world)
    if (world.saved > saved) soundSaved()
    if (world.lost > lost) soundLost()
    updateSoundtrack(world, get().spec.quota)
    set({ revision: get().revision + 1 })
  },

  select: (s) => set({ selected: get().selected === s ? null : s }),

  // Tapping a driftling. If a skill is already armed this is the fast path — apply it
  // straight away, as the original did. Otherwise it selects that driftling, which
  // puts the camera on it and points the skill bar at it.
  applyTo: (id) => {
    const { world, selected } = get()
    set({ watching: id, cameraMode: 'follow', focus: null })
    if (!selected) return
    if (assignSkill(world, id, selected)) {
      soundSkill(selected)
      set({ revision: get().revision + 1 })
      // Deselect once the last of a skill is spent, so the toolbar can't lie.
      if (world.skills[selected] <= 0) set({ selected: null })
    }
  },

  watch: (id) => set({ watching: id, ...(id === null ? {} : { cameraMode: 'follow', focus: null }) }),

  // With a driftling selected the bar acts on it directly, so the skill buttons are
  // the tap target rather than a figure one cell tall.
  applySkillToWatched: (skill) => {
    const { world, watching } = get()
    if (watching === null) return
    if (assignSkill(world, watching, skill)) {
      soundSkill(skill)
      set({ revision: get().revision + 1 })
    }
  },

  reset: () =>
    set({
      world: createWorld(get().spec),
      revision: 0,
      selected: null,
      watching: null,
      paused: false,
    }),

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
      watching: null,
      paused: false,
      generating: false,
    })
  },

  startPlaying: () => {
    void startSoundtrack()
    set({ phase: 'playing', world: createWorld(get().spec), revision: 0, watching: null })
  },

  togglePause: () => set({ paused: !get().paused }),
  toggleMuted: () => {
    const muted = !get().muted
    setSoundtrackMuted(muted)
    set({ muted })
  },
  // The button cycles back to following; the map is what puts you in manual.
  toggleCamera: () =>
    set({ cameraMode: get().cameraMode === 'overview' ? 'follow' : 'overview', focus: null }),

  panTo: (x, y) => set({ cameraMode: 'manual', focus: { x, y } }),

  // Scrolling out pulls back to the whole level; scrolling in returns to the action.
  // Zoom is the natural gesture for "show me more", and hunting for the right button
  // mid-level is not.
  zoom: (direction) => {
    const mode = get().cameraMode
    if (direction === 'out') {
      if (mode !== 'overview') set({ cameraMode: 'overview', focus: null })
    } else if (mode === 'overview') {
      set({ cameraMode: 'follow', focus: null })
    }
  },
  // Cycle rather than toggle: the default pace is a deliberate amble, so there needs
  // to be a middle gear as well as a fast one.
  setSpeed: (n) => set({ speed: n }),
  cycleSpeed: () => {
    const order = [1, 2, 4]
    const i = order.indexOf(get().speed)
    set({ speed: order[(i + 1) % order.length] })
  },
}))

// Dev-only handle for inspecting live state from the console or a driving script.
// Stripped from production builds by the import.meta.env.DEV guard.
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __game?: typeof useGame }).__game = useGame
}
