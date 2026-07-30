import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import type { Biome } from '../game/biomes'

function hash(i: number, salt: number): number {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Biome-specific life and relics. Kept behind the play plane so decoration never
 * competes with terrain edges or the coloured skill silhouettes. */
export function Ambience({
  width,
  height,
  biome,
}: {
  width: number
  height: number
  biome: Biome
}) {
  const drift = useRef<Group>(null)
  const motes = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => ({
        x: hash(i, 1) * width,
        y: -hash(i, 2) * height,
        z: -4 - hash(i, 3) * 10,
        s: 0.05 + hash(i, 4) * 0.16,
      })),
    [width, height],
  )

  useFrame(({ clock }) => {
    if (!drift.current) return
    drift.current.position.y = Math.sin(clock.elapsedTime * 0.18) * 0.45
    drift.current.rotation.z = Math.sin(clock.elapsedTime * 0.09) * 0.006
  })

  const color =
    biome.name === 'Ember'
      ? '#ff7b3d'
      : biome.name === 'Glacier'
        ? '#b8f3ff'
        : biome.name === 'Verdant'
          ? '#8affb1'
          : biome.name === 'Amethyst'
            ? '#dd8cff'
            : biome.name === 'Rust'
              ? '#efb06d'
              : '#77dcff'

  return (
    <group ref={drift}>
      {motes.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, m.z]} scale={m.s}>
          {biome.name === 'Glacier' || biome.name === 'Amethyst' ? (
            <octahedronGeometry args={[1, 0]} />
          ) : biome.name === 'Ember' ? (
            <tetrahedronGeometry args={[1, 0]} />
          ) : (
            <sphereGeometry args={[1, 5, 4]} />
          )}
          <meshBasicMaterial color={color} transparent opacity={0.5 + hash(i, 8) * 0.35} fog />
        </mesh>
      ))}

      {/* One large motif gives every palette a different silhouette, not just a tint. */}
      {biome.name === 'Drift' && (
        <mesh position={[width * 0.78, -height * 0.28, -18]} rotation={[0.2, 0.4, 0]}>
          <torusGeometry args={[4.5, 0.32, 8, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.2} fog />
        </mesh>
      )}
      {biome.name === 'Ember' && (
        <mesh position={[width * 0.18, -height * 0.72, -16]} rotation={[0, 0, 0.35]}>
          <coneGeometry args={[5, 16, 5]} />
          <meshBasicMaterial color="#5b1d22" fog />
        </mesh>
      )}
      {biome.name === 'Glacier' && (
        <group position={[width * 0.76, -height * 0.68, -17]}>
          {[-3, 0, 3].map((x, i) => (
            <mesh key={x} position={[x, i * 1.4, 0]} scale={[1.4, 7 - i, 1.4]}>
              <octahedronGeometry args={[1, 0]} />
              <meshBasicMaterial color="#477fa8" transparent opacity={0.45} fog />
            </mesh>
          ))}
        </group>
      )}
      {biome.name === 'Verdant' && (
        <group position={[width * 0.2, -height * 0.55, -15]}>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[i * 2.4, i * -1.5, 0]} rotation={[Math.PI / 2, 0, i * 0.5]}>
              <torusGeometry args={[3 + i, 0.22, 6, 24, Math.PI * 1.35]} />
              <meshBasicMaterial color="#226b4a" transparent opacity={0.5} fog />
            </mesh>
          ))}
        </group>
      )}
      {biome.name === 'Amethyst' && (
        <mesh position={[width * 0.16, -height * 0.7, -18]} scale={[5, 11, 3]}>
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial color="#592f85" transparent opacity={0.5} fog />
        </mesh>
      )}
      {biome.name === 'Rust' && (
        <group position={[width * 0.75, -height * 0.45, -18]}>
          {[5, 3.2].map((radius, i) => (
            <mesh key={radius} position={[i * 5, i * -4, 0]} rotation={[Math.PI / 2, 0, i]}>
              <torusGeometry args={[radius, 0.65, 6, 12]} />
              <meshBasicMaterial color="#6b4028" transparent opacity={0.55} fog />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}
