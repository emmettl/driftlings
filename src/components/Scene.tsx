import { useRef } from 'react'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import type { World } from '../sim/types'
import { setViewport } from '../game/viewport'
import { setTickAlpha } from '../game/clock'
import { smoothX, smoothY } from '../game/interpolate'
import { biomeFor } from '../game/biomes'
import { Backdrop } from './Backdrop'
import { Ambience } from './Ambience'
import { Markers } from './Markers'
import { Terrain } from './Terrain'
import { Driftlings } from './Driftlings'
import { useGame } from '../store'

// Simulation ticks per real second at 1x. This is presentation only — the rules are
// counted in ticks, so changing it alters the pace on screen without touching the
// simulation's semantics, the solver, or any test.
//
// A driftling walks one cell every RULES.walkPeriod ticks, so this is really "how
// briskly do they stroll". 30Hz was a scurry and 16 was still brisk; at 10 they amble,
// which suits the tone and leaves you time to think before one walks off a ledge.
// Impatience is catered for by the speed control rather than the default.
const TICK_HZ = 10

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
    // Whatever is left over is how far we are into the next tick — the renderer uses
    // it to place driftlings between cells rather than on them.
    setTickAlpha(acc.current)
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
  const panned = useGame((s) => s.focus)
  const watching = useGame((s) => s.watching)
  // Smoothed focus, so the camera eases after the action instead of snapping to it.
  const focus = useRef({ x: world.width / 2, y: -world.height / 2, d: 40 })
  // Banking. The camera always eases toward its target, so how far it is LAGGING
  // behind where you have pointed is already an inertia signal — no need to measure
  // drag velocity separately. That lag is turned into a slight roll and a slight
  // orbit, so the level leans into the movement and settles when you stop, with the
  // backdrop parallaxing against it.
  const lean = useRef({ roll: 0, yaw: 0 })
  // Who the camera is watching. Re-picking the closest to the exit every frame makes
  // the shot flick between two driftlings that are neck and neck, so the incumbent
  // keeps the job unless somebody is clearly ahead.
  const leadId = useRef<number | null>(null)

  useFrame((_, dt) => {
    const aspect = size.width / Math.max(1, size.height)
    const t = Math.tan((FOV * Math.PI) / 180 / 2)

    // Overview: frame the whole level, whatever the viewport shape.
    const overviewDist = Math.max(distanceFor(world.height), world.width / 2 / (t * aspect)) * 1.08

    let targetX = (world.width - 1) / 2
    let targetY = -(world.height - 1) / 2
    let targetDist = overviewDist

    if (mode === 'follow' || mode === 'manual') {
      targetDist = Math.min(overviewDist, distanceFor(FOLLOW_CELLS))
      // Follow whoever is furthest along — that is where the decisions are being
      // made. Falling back to the entrance keeps the shot sensible before anyone is
      // out, and while the last of them are still filing in.
      const live = world.driftlings.filter((d) => d.activity !== 'dead' && d.activity !== 'saved')
      const toExit = (d: (typeof live)[number]) =>
        Math.abs(d.x - world.exit.x) + Math.abs(d.y - world.exit.y)

      // A driftling you have selected outranks the leader: you asked to watch it.
      const watched = watching === null ? undefined : live.find((d) => d.id === watching)
      const incumbent = watched ?? live.find((d) => d.id === leadId.current)
      let lead = incumbent ?? live[0]
      let best = lead ? toExit(lead) : Infinity
      if (!watched) {
        for (const d of live) {
          const dist = toExit(d)
          // A challenger has to be a couple of cells better to take over.
          if (dist < best - (incumbent ? 3 : 0)) {
            best = dist
            lead = d
          }
        }
      }
      leadId.current = lead ? lead.id : null
      if (mode === 'manual' && panned) {
        // The player has taken the wheel via the minimap.
        targetX = panned.x
        targetY = -panned.y
      } else if (lead) {
        // The interpolated position, not the cell. Following the raw cell made the
        // camera lurch a whole cell at a time while the driftling glided smoothly.
        targetX = smoothX(lead)
        targetY = -smoothY(lead)
      } else {
        targetX = world.entrance.x
        targetY = -world.entrance.y
      }

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
    const lagX = targetX - focus.current.x
    const lagY = targetY - focus.current.y
    focus.current.x += lagX * k
    focus.current.y += lagY * k
    focus.current.d += (targetDist - focus.current.d) * k

    // The lean chases the lag on its own, slower spring, so it builds as you drag and
    // eases back afterwards rather than snapping with the camera.
    //
    // Only while dragging the map, though. Zooming also moves the camera target — out
    // to the middle of the level, or back to whoever is leading — and that lag is not
    // a drag, so leaning on it made the whole level swing every time you touched the
    // wheel. Outside manual mode the lean simply unwinds to level.
    const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v))
    const lk = 1 - Math.pow(0.02, Math.min(dt, 0.1))
    const dragging = mode === 'manual'
    // Roll is the effect: the map tilts about the view axis, leaning into the drag.
    // Kept small — it should be felt rather than noticed, and a big roll makes a
    // side-on puzzle harder to read for no gain.
    const rollTo = dragging ? clamp(-lagX * 0.006, 0.05) : 0
    // A smaller orbit rides along, just enough that the backdrop shifts against the
    // level and the tilt reads as a viewpoint rather than a rotated picture.
    const yawTo = dragging ? clamp(lagX * 0.002, 0.022) : 0
    lean.current.roll += (rollTo - lean.current.roll) * lk
    lean.current.yaw += (yawTo - lean.current.yaw) * lk

    const f = focus.current
    // Orbit the focus by the lean, so the tilt is a real change of viewpoint — the
    // backdrop shifts against the level — rather than the picture merely rotating.
    const yaw = lean.current.yaw
    const height = f.d * 0.05
    camera.position.set(
      f.x + Math.sin(yaw) * f.d,
      f.y + height - (dragging ? lagY * 0.012 : 0),
      Math.cos(yaw) * f.d,
    )
    camera.lookAt(f.x, f.y, 0)
    camera.rotateZ(lean.current.roll)

    const halfH = f.d * t
    setViewport(f.x, -f.y, halfH * aspect, halfH)
  })
  return null
}

export function Scene() {
  const world = useGame((s) => s.world)
  const revision = useGame((s) => s.revision)
  const applyTo = useGame((s) => s.applyTo)
  const seed = useGame((s) => s.seed)
  const watchingId = useGame((s) => s.watching)
  const biome = biomeFor(seed)

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
      <color attach="background" args={[biome.sky.getHex()]} />
      <fog attach="fog" args={[biome.sky.getHex(), world.width * 1.6, world.width * 4]} />

      <Rig world={world} />
      <Ticker />

      <ambientLight intensity={0.5} />
      <hemisphereLight args={[biome.light.skyLight.getHex(), biome.light.groundLight.getHex(), 0.9]} />
      <directionalLight position={[12, 18, 22]} intensity={1.5} color={biome.light.key.getHex()} />
      <pointLight
        position={[world.width / 2, -world.height / 2, 14]}
        intensity={90}
        color={biome.light.fill.getHex()}
      />

      <Backdrop width={world.width} height={world.height} biome={biome} />
      <Ambience width={world.width} height={world.height} biome={biome} />
      <Markers world={world} />

      <group onPointerDown={onPick}>
        <Driftlings world={world} revision={revision} watching={watchingId} />
      </group>
      <Terrain world={world} revision={revision} biome={biome} />
    </>
  )
}
