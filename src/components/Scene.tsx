import { useRef } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import type { World } from '../sim/types'
import { setViewport } from '../game/viewport'
import { Backdrop } from './Backdrop'
import { Markers } from './Markers'
import { Terrain } from './Terrain'
import { Driftlings } from './Driftlings'
import { useGame } from '../store'

// Simulation ticks per real second at 1x. This is presentation only — the rules are
// counted in ticks, so changing it alters the pace on screen without touching the
// simulation's semantics, the solver, or any test.
//
// A driftling walks one cell every RULES.walkPeriod ticks, so this is really "how
// briskly do they stroll". 30Hz was a scurry; this is a wander, which suits the tone
// and gives you time to think before something walks off a ledge.
const TICK_HZ = 16

function Ticker() {
  const acc = useRef(0)
  useFrame((_, dt) => {
    const { tick, speed } = useGame.getState()
    // Fixed timestep: the sim must never see a variable dt, or replays would drift.
    acc.current += Math.min(dt, 0.25) * TICK_HZ * speed
    let guard = 0
    while (acc.current >= 1 && guard++ < 8) {
      acc.current -= 1
      tick()
    }
  })
  return null
}

const FOLLOW_CELLS = 19 // how tall a slice to show when following the action
const FOV = 45

function distanceFor(cells: number): number {
  return cells / 2 / Math.tan((FOV * Math.PI) / 180 / 2)
}

function Rig({ world }: { world: World }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const mode = useGame((s) => s.cameraMode)
  // Smoothed focus, so the camera eases after the action instead of snapping to it.
  const focus = useRef({ x: world.width / 2, y: -world.height / 2, d: 40 })

  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height)
    const t = Math.tan((FOV * Math.PI) / 180 / 2)

    // Overview: frame the whole level, whatever the viewport shape.
    const overviewDist = Math.max(distanceFor(world.height), world.width / 2 / (t * aspect)) * 1.08

    let targetX = (world.width - 1) / 2
    let targetY = -(world.height - 1) / 2
    let targetDist = overviewDist

    if (mode === 'follow') {
      targetDist = Math.min(overviewDist, distanceFor(FOLLOW_CELLS))
      // Follow whoever is furthest along — that is where the decisions are being
      // made. Falling back to the entrance keeps the shot sensible before anyone is
      // out, and while the last of them are still filing in.
      const live = world.driftlings.filter((d) => d.activity !== 'dead' && d.activity !== 'saved')
      let lead = live[0]
      let best = Infinity
      for (const d of live) {
        const dist = Math.abs(d.x - world.exit.x) + Math.abs(d.y - world.exit.y)
        if (dist < best) {
          best = dist
          lead = d
        }
      }
      targetX = lead ? lead.x : world.entrance.x
      targetY = lead ? -lead.y : -world.entrance.y

      // Do not show the void beyond the level edges.
      const halfH = targetDist * t
      const halfW = halfH * aspect
      targetX = Math.min(Math.max(targetX, halfW - 0.5), world.width - halfW - 0.5)
      targetY = Math.max(Math.min(targetY, -halfH + 0.5), -(world.height - halfH) + 0.5)
      if (halfW * 2 >= world.width) targetX = (world.width - 1) / 2
      if (halfH * 2 >= world.height) targetY = -(world.height - 1) / 2
    }

    // Exponential smoothing, frame-rate independent.
    const k = 1 - Math.pow(0.0015, Math.min(dt, 0.1))
    focus.current.x += (targetX - focus.current.x) * k
    focus.current.y += (targetY - focus.current.y) * k
    focus.current.d += (targetDist - focus.current.d) * k

    const f = focus.current
    camera.position.set(f.x, f.y + f.d * 0.05, f.d)
    camera.lookAt(f.x, f.y, 0)

    const halfH = f.d * t
    setViewport(f.x, -f.y, halfH * aspect, halfH)
  })
  return null
}

export function Scene() {
  const world = useGame((s) => s.world)
  const revision = useGame((s) => s.revision)
  const applyTo = useGame((s) => s.applyTo)

  const onPick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const i = e.instanceId
    if (i === undefined) return
    const live = world.driftlings.filter((d) => d.activity !== 'saved' && d.activity !== 'dead')
    const target = live[i]
    if (target) applyTo(target.id)
  }

  return (
    <>
      <color attach="background" args={['#0a0a1a']} />
      <fog attach="fog" args={['#0a0a1a', world.width * 1.6, world.width * 4]} />

      <Rig world={world} />
      <Ticker />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#6a5cff', '#100e26', 0.9]} />
      <directionalLight position={[12, 18, 22]} intensity={1.5} color="#ffd0f0" />
      <pointLight position={[world.width / 2, -world.height / 2, 14]} intensity={90} color="#4be0ff" />

      <Backdrop width={world.width} height={world.height} />
      <Markers world={world} />

      <group onPointerDown={onPick}>
        <Driftlings world={world} revision={revision} />
      </group>
      <Terrain world={world} revision={revision} />
    </>
  )
}
