import { useMemo } from 'react'
import { Color } from 'three'
import { quality } from '../game/device'

// Distant silhouettes behind the playfield. They exist for parallax: the camera
// translates as it follows the action, and geometry further back drifts across the
// frame more slowly, which is what makes the level feel like a place rather than a
// diagram. Nothing here is interactive and the simulation never sees it.

function hash(i: number, salt: number): number {
  const n = Math.sin(i * 91.7 + salt * 47.3) * 43758.5453
  return n - Math.floor(n)
}

export function Backdrop({ width, height }: { width: number; height: number }) {
  const layers = useMemo(() => {
    // Three sheets at increasing depth, each fading further toward the fog.
    return [
      { z: -22, count: 10, w: 6, h: 26, color: new Color('#1b2049'), scale: 1.25 },
      { z: -46, count: 8, w: 10, h: 36, color: new Color('#151a38'), scale: 1.6 },
      { z: -78, count: 6, w: 16, h: 52, color: new Color('#101228'), scale: 2.2 },
    ]
      .slice(0, quality.backdropLayers)
      .map((layer, li) => ({
      ...layer,
      pillars: Array.from({ length: layer.count }, (_, i) => {
        const r = hash(i, li)
        const r2 = hash(i + 50, li)
        return {
          x: (i / layer.count) * width * layer.scale - (width * (layer.scale - 1)) / 2 + r * 4,
          y: -height * (0.25 + r2 * 0.6),
          w: layer.w * (0.6 + r * 0.8),
          h: layer.h * (0.6 + r2 * 0.9),
        }
      }),
      }))
  }, [width, height])

  return (
    <group>
      {layers.map((layer, li) => (
        <group key={li}>
          {layer.pillars.map((p, i) => (
            <mesh key={i} position={[p.x, p.y, layer.z]}>
              <boxGeometry args={[p.w, p.h, 2]} />
              <meshBasicMaterial color={layer.color} fog />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
