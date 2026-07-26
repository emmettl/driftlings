import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { assignSkill, stepWorld } from '../sim/step'
import { createWorld } from '../sim/world'
import { attractStage } from '../levels/attract'
import { SKILL_IDS, type SkillId } from '../sim/types'
import { Terrain } from './Terrain'
import { Driftlings } from './Driftlings'
import { Backdrop } from './Backdrop'
import { setTickAlpha } from '../game/clock'

// The title screen runs the real simulation on a sealed arena, so what you are
// watching is genuine driftling behaviour rather than an animation of it — a crowd
// pacing into a blocker and turning round is simply what the rules do.
//
// Every so often somebody is handed a skill at random, which is where the daftness
// comes from: one of them plants itself in the middle of a corridor, another digs a
// hole and drops through it, a third floats down under a canopy for no reason. The
// arena is reset periodically so the holes and blockers do not accumulate for ever.

const TICK_HZ = 9
const WHIMSY_EVERY = 26 // ticks between someone being handed a skill
const RESET_AFTER = 1500 // ticks before the arena is wiped and refilled

// Weighted so the funny ones come up most.
//
// No climber, deliberately: a climber scales the arena's boundary wall, escapes over
// the top of the world and splats on the way back down. Measured — with climbers in
// the pool 20 of 24 died over a run; without, nobody does. Nothing dies on the title
// screen.
const WHIMSY: SkillId[] = ['blocker', 'blocker', 'digger', 'floater', 'basher']

/** A world with the crowd already out and milling, so the title screen never opens on
 *  an empty arena waiting for the first driftling to be released. */
function populatedArena() {
  const w = createWorld(attractStage)
  for (let i = 0; i < 260; i++) stepWorld(w)
  return w
}

export function AttractScene() {
  const [world, setWorld] = useState(populatedArena)
  const acc = useRef(0)
  const revision = useRef(0)
  const [, forceRender] = useState(0)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const centre = useMemo(
    () => ({ x: (world.width - 1) / 2, y: -(world.height - 1) / 2 }),
    [world.width, world.height],
  )

  useFrame(({ clock }, dt) => {
    acc.current += Math.min(dt, 0.25) * TICK_HZ
    let guard = 0
    while (acc.current >= 1 && guard++ < 6) {
      acc.current -= 1
      stepWorld(world)

      // Hand somebody a skill, purely for the comedy of it.
      if (world.tick % WHIMSY_EVERY === 0) {
        const idle = world.driftlings.filter((d) => d.activity === 'walker')
        if (idle.length > 0) {
          const who = idle[Math.floor(Math.random() * idle.length)]
          assignSkill(world, who.id, WHIMSY[Math.floor(Math.random() * WHIMSY.length)])
          // Keep the arena stocked so it never runs dry.
          for (const s of SKILL_IDS) world.skills[s] = 99
        }
      }

      if (world.tick > RESET_AFTER) {
        setWorld(populatedArena())
        acc.current = 0
        return
      }
      revision.current += 1
    }
    setTickAlpha(acc.current)
    forceRender(revision.current)

    // A slow drift across the arena, so the shot is never quite still.
    const t = clock.elapsedTime
    const aspect = size.width / Math.max(1, size.height)
    const halfTan = Math.tan((45 * Math.PI) / 180 / 2)
    const dist = Math.max(world.height / 2 / halfTan, world.width / 2 / (halfTan * aspect)) * 0.82
    camera.position.set(
      centre.x + Math.sin(t * 0.11) * 3.4,
      centre.y + 2.5 + Math.cos(t * 0.09) * 1.4,
      dist,
    )
    camera.lookAt(centre.x, centre.y + 1, 0)
  })

  return (
    <>
      <color attach="background" args={['#0a0a1a']} />
      <fog attach="fog" args={['#0a0a1a', world.width * 2, world.width * 5]} />

      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#6a5cff', '#100e26', 0.9]} />
      <directionalLight position={[12, 18, 22]} intensity={1.4} color="#ffd0f0" />
      <pointLight position={[centre.x, centre.y, 14]} intensity={70} color="#4be0ff" />

      <Backdrop width={world.width} height={world.height} />
      <Terrain world={world} revision={revision.current} />
      <Driftlings world={world} revision={revision.current} />
    </>
  )
}
