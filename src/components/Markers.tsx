import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, PointLight } from 'three'
import type { World } from '../sim/types'

// The two cells that decide the whole level — where driftlings arrive and where they
// have to get to — were not drawn at all: the terrain renderer only knows about earth
// and steel, so the entrance and exit were invisible. Nothing to aim at.
//
// Both are marked with light rather than geometry alone, so they read at a glance from
// across the level and survive being small on screen.

const FRONT = 1.9 // just in front of the rock face, alongside the driftlings

export function Markers({ world }: { world: World }) {
  // Reaching the exit is the most satisfying thing that happens in the game and had
  // no feedback at all. A save now punches the portal: a bright flare that fades.
  const savedSeen = useRef(0)
  const flare = useRef(0)
  const exitRing = useRef<Mesh>(null)
  const exitBeam = useRef<Mesh>(null)
  const exitLight = useRef<PointLight>(null)
  const entryGroup = useRef<Group>(null)
  const entryBeam = useRef<Mesh>(null)

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4)

    // Somebody made it since the last frame?
    if (world.saved > savedSeen.current) {
      flare.current = 1
      savedSeen.current = world.saved
    } else if (world.saved < savedSeen.current) {
      savedSeen.current = world.saved // the level was restarted
    }
    flare.current = Math.max(0, flare.current - dt * 1.8)
    const burst = flare.current * flare.current

    if (exitRing.current) {
      const s = 1 + pulse * 0.16 + burst * 0.9
      exitRing.current.scale.set(s, s, 1)
      // It spins up sharply on a save, then settles back.
      exitRing.current.rotation.z = t * (0.6 + burst * 9)
      const mat = exitRing.current.material as unknown as { emissiveIntensity: number }
      mat.emissiveIntensity = 2.6 + burst * 9
    }
    if (exitBeam.current) {
      const mat = exitBeam.current.material as { opacity: number }
      mat.opacity = 0.1 + pulse * 0.16 + burst * 0.5
    }
    if (exitLight.current) exitLight.current.intensity = 9 + pulse * 10 + burst * 60

    // The entrance hatch bobs gently, and its beam marks the column driftlings drop
    // down — the thing you actually need to read to plan the first few seconds.
    if (entryGroup.current) entryGroup.current.position.y = -world.entrance.y + pulse * 0.1
    if (entryBeam.current) {
      const mat = entryBeam.current.material as { opacity: number }
      mat.opacity = 0.08 + pulse * 0.1
    }
  })

  return (
    <group>
      {/* ---- Exit: a pulsing portal with a shaft of light above it ---- */}
      <group position={[world.exit.x, -world.exit.y, 0]}>
        <mesh ref={exitRing} position={[0, 0, FRONT]}>
          <torusGeometry args={[0.62, 0.11, 10, 24]} />
          <meshStandardMaterial
            color="#8affc1"
            emissive="#8affc1"
            emissiveIntensity={2.6}
            toneMapped={false}
          />
        </mesh>
        <mesh position={[0, 0, FRONT - 0.35]}>
          <circleGeometry args={[0.55, 24]} />
          <meshBasicMaterial color="#0d3f30" transparent opacity={0.85} />
        </mesh>
        <mesh ref={exitBeam} position={[0, 7, FRONT - 0.6]}>
          <planeGeometry args={[1.5, 14]} />
          <meshBasicMaterial color="#8affc1" transparent opacity={0.16} depthWrite={false} />
        </mesh>
        <pointLight ref={exitLight} color="#8affc1" distance={14} decay={2} intensity={12} />
      </group>

      {/* ---- Entrance: a hatch, and the column its driftlings fall down ---- */}
      <group ref={entryGroup} position={[world.entrance.x, -world.entrance.y, 0]}>
        <mesh position={[0, 0.35, FRONT - 0.2]}>
          <boxGeometry args={[1.5, 0.22, 0.7]} />
          <meshStandardMaterial
            color="#ff7ad9"
            emissive="#ff7ad9"
            emissiveIntensity={1.6}
            toneMapped={false}
          />
        </mesh>
        {[-0.62, 0.62].map((x) => (
          <mesh key={x} position={[x, 0.02, FRONT - 0.2]}>
            <boxGeometry args={[0.24, 0.5, 0.6]} />
            <meshStandardMaterial
              color="#c14fa0"
              emissive="#ff7ad9"
              emissiveIntensity={0.7}
              toneMapped={false}
            />
          </mesh>
        ))}
        <mesh ref={entryBeam} position={[0, -3.2, FRONT - 0.7]}>
          <planeGeometry args={[1.1, 6.4]} />
          <meshBasicMaterial color="#ff7ad9" transparent opacity={0.14} depthWrite={false} />
        </mesh>
        <pointLight color="#ff7ad9" distance={9} decay={2} intensity={7} />
      </group>
    </group>
  )
}
