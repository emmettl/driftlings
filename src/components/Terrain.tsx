import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { CELL } from '../sim/types'
import type { World } from '../sim/types'

// Gameplay is strictly 2D (the sim never knows about z), but the level is drawn as a
// cut-away slab of rock. Flat-shaded boxes of one colour read as a tile map, so each
// cell gets:
//
//   - depth shading: how deeply buried the cell is darkens it, which is what gives the
//     mass a sense of volume rather than looking like a sticker
//   - deterministic per-cell noise on hue, brightness and how far the block juts
//     forward, so the face has relief instead of being one flat wall
//   - a bright crown on any cell with open sky above, picking out every walkable edge
//   - occasional crystal growths on exposed rock, for variety at no gameplay cost
//
// All of it is derived from (x, y) by hash, so it is stable across frames and between
// runs — the same level always looks the same.

const DEPTH = 3.4

const PALETTE = {
  earthTop: new Color('#5fd6ff'),
  earthShallow: new Color('#3f6ea8'),
  earthDeep: new Color('#131f3d'),
  steelTop: new Color('#b39ae8'),
  steelDeep: new Color('#3b2f63'),
  crystal: new Color('#7affd4'),
  crown: new Color('#9beeff'),
}

/** Stable pseudo-random in [0,1) from a cell coordinate. */
function hash(x: number, y: number, salt = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453
  return n - Math.floor(n)
}

interface Block {
  x: number
  y: number
  kind: number
  /** How many solid cells sit directly above, capped — drives the depth shading. */
  buried: number
  top: boolean
  n: number
}

export function Terrain({ world, revision }: { world: World; revision: number }) {
  const base = useRef<InstancedMesh>(null)
  const crown = useRef<InstancedMesh>(null)
  const crystal = useRef<InstancedMesh>(null)

  const blocks = useMemo(() => {
    const out: Block[] = []
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false
      const c = world.cells[y * world.width + x]
      return c === CELL.EARTH || c === CELL.STEEL
    }
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const c = world.cells[y * world.width + x]
        if (c !== CELL.EARTH && c !== CELL.STEEL) continue
        let buried = 0
        while (buried < 7 && solid(x, y - 1 - buried)) buried++
        out.push({ x, y, kind: c, buried, top: !solid(x, y - 1), n: hash(x, y) })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, revision])

  useLayoutEffect(() => {
    const b = base.current
    const cr = crown.current
    const cy = crystal.current
    if (!b || !cr || !cy) return

    const dummy = new Object3D()
    const tint = new Color()
    let crowns = 0
    let crystals = 0

    blocks.forEach((blk, i) => {
      const steel = blk.kind === CELL.STEEL
      // Blocks jut forward by varying amounts so the cut face has relief.
      const jut = blk.n * 0.7
      dummy.position.set(blk.x, -blk.y, (jut - 0.35) / 2)
      dummy.scale.set(1, 1, DEPTH + jut)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      b.setMatrixAt(i, dummy.matrix)

      // Shade by how deeply buried the cell is, then jitter so no two are identical.
      const t = Math.min(1, blk.buried / 5)
      if (steel) {
        tint.copy(PALETTE.steelTop).lerp(PALETTE.steelDeep, t)
      } else {
        tint.copy(blk.top ? PALETTE.earthTop : PALETTE.earthShallow).lerp(PALETTE.earthDeep, t)
      }
      tint.multiplyScalar(0.86 + blk.n * 0.28)
      b.setColorAt(i, tint)

      if (blk.top) {
        // A bright lip along every walkable surface.
        dummy.position.set(blk.x, -blk.y + 0.46, (jut - 0.35) / 2 + 0.15)
        dummy.scale.set(1, 0.12, DEPTH + jut - 0.3)
        dummy.updateMatrix()
        cr.setMatrixAt(crowns, dummy.matrix)
        cr.setColorAt(crowns, steel ? PALETTE.steelTop : PALETTE.crown)
        crowns += 1

        // Occasional growths, purely decorative.
        const g = hash(blk.x, blk.y, 3)
        if (!steel && g > 0.86) {
          const h = 0.25 + g * 0.5
          dummy.position.set(blk.x + (g - 0.86) * 2 - 0.15, -blk.y + 0.5 + h / 2, DEPTH / 2 - 0.4)
          dummy.scale.set(0.16, h, 0.16)
          dummy.rotation.set(0, 0, (g - 0.9) * 1.2)
          dummy.updateMatrix()
          cy.setMatrixAt(crystals, dummy.matrix)
          cy.setColorAt(crystals, PALETTE.crystal)
          crystals += 1
          dummy.rotation.set(0, 0, 0)
        }
      }
    })

    b.count = blocks.length
    cr.count = crowns
    cy.count = crystals
    b.instanceMatrix.needsUpdate = true
    cr.instanceMatrix.needsUpdate = true
    cy.instanceMatrix.needsUpdate = true
    if (b.instanceColor) b.instanceColor.needsUpdate = true
    if (cr.instanceColor) cr.instanceColor.needsUpdate = true
    if (cy.instanceColor) cy.instanceColor.needsUpdate = true
  }, [blocks])

  const cap = world.width * world.height
  return (
    <group>
      <instancedMesh ref={base} args={[undefined, undefined, cap]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.72} metalness={0.18} />
      </instancedMesh>

      <instancedMesh ref={crown} args={[undefined, undefined, cap]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.35}
          metalness={0.1}
          emissive="#2e6f8c"
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={crystal} args={[undefined, undefined, cap]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.25}
          metalness={0.3}
          emissive="#1f7a63"
          emissiveIntensity={0.8}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}
