import { useRef } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Terrain } from './Terrain'
import { Driftlings } from './Driftlings'
import { useGame } from '../store'

const TICK_HZ = 30 // sim ticks per second at speed 1

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

function Rig({ width, height }: { width: number; height: number }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  useFrame(({ clock }) => {
    const aspect = size.width / Math.max(1, size.height)
    // Frame the whole level, whatever the viewport shape (same lesson as before).
    const t = Math.tan((45 * Math.PI) / 180 / 2)
    const forHeight = height / 2 / t
    const forWidth = width / 2 / (t * aspect)
    const dist = Math.max(forHeight, forWidth) * 1.08

    // A slow drift so the diorama reads as dimensional rather than a flat picture.
    const sway = Math.sin(clock.elapsedTime * 0.15) * dist * 0.05
    camera.position.set((width - 1) / 2 + sway, -(height - 1) / 2 + dist * 0.06, dist)
    camera.lookAt((width - 1) / 2, -(height - 1) / 2, 0)
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

      <Rig width={world.width} height={world.height} />
      <Ticker />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#6a5cff', '#100e26', 0.9]} />
      <directionalLight position={[12, 18, 22]} intensity={1.5} color="#ffd0f0" />
      <pointLight position={[world.width / 2, -world.height / 2, 14]} intensity={90} color="#4be0ff" />

      <group onPointerDown={onPick}>
        <Driftlings world={world} revision={revision} />
      </group>
      <Terrain world={world} revision={revision} />
    </>
  )
}
