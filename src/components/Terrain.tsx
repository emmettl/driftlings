import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { CELL } from '../sim/types'
import type { World } from '../sim/types'

// The level is a cut-away slab of rock. One box per cell was the problem: the face we
// actually look at ends up a single flat plane per cell, which reads as a chunky tile
// map however carefully it is coloured.
//
// So the visible surface is built from several passes:
//
//   bulk    one box per cell — the structural mass, mostly hidden behind everything else
//   plates  the face split into a 2x2 mosaic, each quadrant at its own depth and
//           slightly rolled, so the wall we look at has genuine relief
//   rubble  faceted chunks on walkable surfaces and along open edges, breaking the
//           perfectly straight silhouette a grid otherwise gives you
//   crown   a bright lip picking out every walkable edge
//   crystal occasional growths, for variety
//
// Everything is instanced — five draw calls for the whole level, whatever its size —
// and every value derives from (x, y) by hash, so a level always looks the same.

const DEPTH = 3.4
/**
 * The plane the face sits on. Detail varies BACKWARDS from here: driftlings are drawn
 * just in front of it, and letting rock grow towards the camera buried them inside it.
 */
const FRONT = 1.55

// The rock changes character with altitude, so a descent reads as going somewhere
// rather than as more of the same.
const STRATA = [
  { surface: new Color('#5fd6ff'), body: new Color('#3f6ea8'), crown: new Color('#9beeff') },
  { surface: new Color('#a071e8'), body: new Color('#4b3a86'), crown: new Color('#c9a6ff') },
  { surface: new Color('#ff8f6b'), body: new Color('#7d3a52'), crown: new Color('#ffc38f') },
]

function strataAt(t: number) {
  const scaled = Math.min(0.999, Math.max(0, t)) * (STRATA.length - 1)
  const i = Math.floor(scaled)
  const f = scaled - i
  const a = STRATA[i]
  const b = STRATA[Math.min(STRATA.length - 1, i + 1)]
  return {
    surface: a.surface.clone().lerp(b.surface, f),
    body: a.body.clone().lerp(b.body, f),
    crown: a.crown.clone().lerp(b.crown, f),
  }
}

const PALETTE = {
  earthDeep: new Color('#0e1630'),
  steelTop: new Color('#b39ae8'),
  steelDeep: new Color('#3b2f63'),
  crystal: new Color('#7affd4'),
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
  openLeft: boolean
  openRight: boolean
  n: number
  /** Position through the level's strata, 0 at the surface and 1 at the depths. */
  depthT: number
}

export function Terrain({ world, revision }: { world: World; revision: number }) {
  const bulk = useRef<InstancedMesh>(null)
  const plates = useRef<InstancedMesh>(null)
  const rubble = useRef<InstancedMesh>(null)
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
        out.push({
          x,
          y,
          kind: c,
          buried,
          top: !solid(x, y - 1),
          openLeft: !solid(x - 1, y),
          openRight: !solid(x + 1, y),
          n: hash(x, y),
          depthT: y / Math.max(1, world.height - 1),
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, revision])

  useLayoutEffect(() => {
    const meshes = [bulk.current, plates.current, rubble.current, crown.current, crystal.current]
    if (meshes.some((m) => !m)) return
    const [bu, pl, ru, cr, cy] = meshes as InstancedMesh[]

    const d = new Object3D()
    const tint = new Color()
    let nPlate = 0
    let nRubble = 0
    let nCrown = 0
    let nCrystal = 0

    blocks.forEach((blk, i) => {
      const steel = blk.kind === CELL.STEEL
      const strata = strataAt(blk.depthT)
      const shade = Math.min(1, blk.buried / 5)

      const bodyColour = (extra: number) => {
        if (steel) tint.copy(PALETTE.steelTop).lerp(PALETTE.steelDeep, shade)
        else tint.copy(blk.top ? strata.surface : strata.body).lerp(PALETTE.earthDeep, shade)
        return tint.multiplyScalar(0.8 + extra * 0.34)
      }

      // --- bulk: the mass behind the face ---
      const depth = DEPTH + blk.n * 1.4
      d.position.set(blk.x, -blk.y, FRONT - 0.22 - depth / 2)
      d.scale.set(1, 1, depth)
      d.rotation.set(0, 0, 0)
      d.updateMatrix()
      bu.setMatrixAt(i, d.matrix)
      bu.setColorAt(i, bodyColour(blk.n * 0.6))

      // --- plates: the face as a 2x2 mosaic, each quadrant at its own depth ---
      for (let q = 0; q < 4; q++) {
        const qx = (q % 2) - 0.5
        const qy = (q < 2 ? 1 : 0) - 0.5
        const h1 = hash(blk.x * 2 + (q % 2), blk.y * 2 + (q < 2 ? 1 : 0), 11)
        const h2 = hash(blk.x, blk.y, 20 + q)
        const out = 0.12 + h1 * 0.3
        d.position.set(blk.x + qx * 0.5, -blk.y + qy * 0.5, FRONT - out / 2)
        d.scale.set(0.52 + h2 * 0.06, 0.52 + h1 * 0.06, out)
        // A touch of roll, so the quadrants do not line back up into a grid.
        d.rotation.set(0, 0, (h2 - 0.5) * 0.1)
        d.updateMatrix()
        pl.setMatrixAt(nPlate, d.matrix)
        pl.setColorAt(nPlate, bodyColour(h1))
        nPlate += 1
      }

      // --- rubble: chunks on walkable surfaces and along open edges ---
      const edges: [number, number][] = []
      if (blk.top) edges.push([0, 0.5])
      if (blk.openLeft) edges.push([-0.5, 0])
      if (blk.openRight) edges.push([0.5, 0])
      for (const [ex, ey] of edges) {
        for (let k = 0; k < 3; k++) {
          const g = hash(blk.x + k * 7, blk.y + k * 13, 31 + ex * 3 + ey * 5)
          if (g < 0.45) continue
          const s = 0.09 + g * 0.17
          d.position.set(
            blk.x + ex * 0.92 + (ex === 0 ? (g - 0.5) * 0.8 : (g - 0.5) * 0.15),
            -blk.y + ey * 0.92 + (ey === 0 ? (g - 0.5) * 0.7 : s * 0.6),
            FRONT - 0.2 - g * 0.5,
          )
          d.scale.set(s, s * (0.7 + g * 0.6), s)
          d.rotation.set(g * 3.1, g * 2.2, g * 1.4)
          d.updateMatrix()
          ru.setMatrixAt(nRubble, d.matrix)
          ru.setColorAt(nRubble, bodyColour(0.25 + g * 0.5))
          nRubble += 1
        }
      }

      if (blk.top) {
        const crownDepth = 0.55
        d.position.set(blk.x, -blk.y + 0.46, FRONT - crownDepth / 2 + 0.05)
        d.scale.set(1, 0.11, crownDepth)
        d.rotation.set(0, 0, 0)
        d.updateMatrix()
        cr.setMatrixAt(nCrown, d.matrix)
        cr.setColorAt(nCrown, steel ? PALETTE.steelTop : strata.crown)
        nCrown += 1

        // Occasional growths, purely decorative.
        const g = hash(blk.x, blk.y, 3)
        if (!steel && g > 0.86) {
          const h = 0.3 + g * 0.5
          d.position.set(blk.x + (g - 0.86) * 2 - 0.15, -blk.y + 0.5 + h / 2, FRONT - 0.5)
          d.scale.set(0.14, h, 0.14)
          d.rotation.set(0, g * 2, (g - 0.9) * 1.2)
          d.updateMatrix()
          cy.setMatrixAt(nCrystal, d.matrix)
          cy.setColorAt(nCrystal, PALETTE.crystal)
          nCrystal += 1
        }
      }
    })

    const counts: [InstancedMesh, number][] = [
      [bu, blocks.length],
      [pl, nPlate],
      [ru, nRubble],
      [cr, nCrown],
      [cy, nCrystal],
    ]
    for (const [m, n] of counts) {
      m.count = n
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [blocks])

  const cells = world.width * world.height
  return (
    <group>
      <instancedMesh ref={bulk} args={[undefined, undefined, cells]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.8} metalness={0.12} />
      </instancedMesh>

      <instancedMesh ref={plates} args={[undefined, undefined, cells * 4]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.68} metalness={0.2} flatShading />
      </instancedMesh>

      {/* Faceted chunks: irregular normals catch the light quite differently to the
          grid, which is most of what stops a surface reading as tiles. */}
      <instancedMesh ref={rubble} args={[undefined, undefined, cells * 9]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.75} metalness={0.15} flatShading />
      </instancedMesh>

      <instancedMesh ref={crown} args={[undefined, undefined, cells]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.35}
          metalness={0.1}
          emissive="#2e6f8c"
          emissiveIntensity={0.5}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={crystal} args={[undefined, undefined, cells]} castShadow>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          roughness={0.25}
          metalness={0.3}
          emissive="#1f7a63"
          emissiveIntensity={0.8}
          toneMapped={false}
          flatShading
        />
      </instancedMesh>
    </group>
  )
}
