import { DriftboxEngine } from '@driftbox/engine'
import type { SkillId, World } from '../sim/types'
import { driftlingsSong } from './song'

type Mood = 'burrow' | 'march' | 'scramble' | 'home'

let engine: DriftboxEngine | null = null
let muted = false
let mood: Mood = 'burrow'

const CHAINS: Record<Mood, { pattern: string; repeat: number }[]> = {
  burrow: [
    { pattern: 'burrow', repeat: 2 },
    { pattern: 'march', repeat: 2 },
  ],
  march: [
    { pattern: 'march', repeat: 4 },
    { pattern: 'burrow', repeat: 1 },
  ],
  scramble: [
    { pattern: 'scramble', repeat: 3 },
    { pattern: 'march', repeat: 1 },
  ],
  home: [
    { pattern: 'home', repeat: 4 },
    { pattern: 'march', repeat: 1 },
  ],
}

export async function startSoundtrack(): Promise<void> {
  if (typeof AudioContext === 'undefined') return
  if (!engine) engine = new DriftboxEngine(driftlingsSong(), { gain: muted ? 0 : 0.46 })
  if (!engine.running) await engine.start()
}

export function setSoundtrackMuted(value: boolean): void {
  muted = value
  if (engine) engine.gain = value ? 0 : 0.46
}

export function updateSoundtrack(world: World, quota: number): void {
  if (!engine) return
  const live = world.driftlings.filter((d) => d.activity !== 'saved' && d.activity !== 'dead')
  const inDanger = live.some(
    (d) => d.activity === 'faller' && !d.isFloater && d.fallen > 5,
  )
  const next: Mood =
    world.saved >= quota
      ? 'home'
      : inDanger || world.lost >= Math.max(2, world.total - quota)
        ? 'scramble'
        : world.spawned >= Math.ceil(world.total / 2)
          ? 'march'
          : 'burrow'
  if (next === mood) return
  mood = next
  engine.song = { ...engine.song, chain: CHAINS[next] }
}

const SKILL_HITS: Record<SkillId, string> = {
  climber: '808.ht',
  floater: '808.oh',
  bomber: '808.bd',
  blocker: '808.cp',
  builder: '808.cb',
  basher: '808.mt',
  miner: '808.lt',
  digger: '808.rs',
}

export function soundSkill(skill: SkillId): void {
  if (!engine || muted) return
  engine.audition(SKILL_HITS[skill], 0.72)
}

export function soundSaved(): void {
  if (!engine || muted) return
  engine.audition('808.cb', 0.9)
}

export function soundLost(): void {
  if (!engine || muted) return
  engine.audition('808.lt', 0.55)
}
