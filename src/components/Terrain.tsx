import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { CELL } from '../sim/types'
import type { World } from '../sim/types'

// The level is a cut-away slab, and it is made of two substances that behave very
// differently — earth can be dug and bashed through, steel cannot. They used to be the
// same boxes in two colours, which wasted the clearest channel available for telling
// the player what they can cut through.
//
// So each material gets its own treatment, and they are drawn by separate passes:
//
//   EARTH  rough and irregular. A 2x2 mosaic face at varying depths, faceted scree on
//          every walkable surface and open edge, crystal growths, and a soft lip along
//          walkable edges. Coloured by strata, so depth reads as a different rock.
//   STEEL  manufactured. Inset panels leaving a seam between neighbours, rivets at the
//          panel corners, a hazard trim along exposed edges, and a metallic finish that
//          catches light quite differently. Uniform colour — it is not geology.
//
// Everything is instanced (nine draw calls for any level) and every value derives from
// (x, y) by hash, so a level always looks the same.

const DEPTH = 3.4
/**
 * The plane the face sits on. Detail varies BACKWARDS from here: driftlings are drawn
 * just in front of it, and letting rock grow towards the camera buried them inside it.
 */
const FRONT = 1.55

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

const EARTH_DEEP = new Color('#0e1630')
const CRYSTAL = new Color('#7affd4')
const STEEL_PANEL = new Color('#8f86b8')
const STEEL_BULK = new Color('#2a2547')
const STEEL_RIVET = new Color('#cfc6ef')
const STEEL_TRIM = new Color('#ffc861') // hazard amber: this is the stuff you cannot dig

function hash(x: number, y: number, salt = 0): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453
  return n - Math.floor(n)
}

interface Block {
  x: number
  y: number
  steel: boolean
  buried: number
  top: boolean
  openLeft: boolean
  openRight: boolean
  n: number
  depthT: number
}

export function Terrain({ world, revision }: { world: World; revision: number }) {
  const earthBulk = useRef<InstancedMesh>(null)
  const earthPlates = useRef<InstancedMesh>(null)
  const scree = useRef<InstancedMesh>(null)
  const lip = useRef<InstancedMesh>(null)
  const crystal = useRef<InstancedMesh>(null)
  const steelBulk = useRef<InstancedMesh>(null)
  const panels = useRef<InstancedMesh>(null)
  const rivets = useRef<InstancedMesh>(null)
  const trim = useRef<InstancedMesh>(null)

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
          steel: c === CELL.STEEL,
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
    const all = [
      earthBulk.current,
      earthPlates.current,
      scree.current,
      lip.current,
      crystal.current,
      steelBulk.current,
      panels.current,
      rivets.current,
      trim.current,
    ]
    if (all.some((m) => !m)) return
    const [eb, ep, sc, lp, cy, sb, pa, ri, tr] = all as InstancedMesh[]

    const d = new Object3D()
    const tint = new Color()
    const n = { eb: 0, ep: 0, sc: 0, lp: 0, cy: 0, sb: 0, pa: 0, ri: 0, tr: 0 }

    for (const blk of blocks) {
      if (blk.steel) {
        // ---------- STEEL: manufactured ----------
        const depth = DEPTH + 0.4
        d.position.set(blk.x, -blk.y, FRONT - 0.2 - depth / 2)
        d.scale.set(1, 1, depth)
        d.rotation.set(0, 0, 0)
        d.updateMatrix()
        sb.setMatrixAt(n.sb, d.matrix)
        sb.setColorAt(n.sb, STEEL_BULK)
        n.sb += 1

        // An inset plate, so the gap to its neighbours reads as a panel seam.
        d.position.set(blk.x, -blk.y, FRONT - 0.09)
        d.scale.set(0.86, 0.86, 0.18)
        d.updateMatrix()
        pa.setMatrixAt(n.pa, d.matrix)
        tint.copy(STEEL_PANEL).multiplyScalar(0.82 + blk.n * 0.22)
        pa.setColorAt(n.pa, tint)
        n.pa += 1

        // Rivets at the panel corners.
        for (const [rx, ry] of [
          [-0.31, -0.31],
          [0.31, -0.31],
          [-0.31, 0.31],
          [0.31, 0.31],
        ]) {
          d.position.set(blk.x + rx, -blk.y + ry, FRONT + 0.02)
          d.scale.setScalar(0.055)
          d.updateMatrix()
          ri.setMatrixAt(n.ri, d.matrix)
          ri.setColorAt(n.ri, STEEL_RIVET)
          n.ri += 1
        }

        // Hazard trim on exposed edges — the visual promise that this cannot be dug.
        const faces: [number, number, number, number][] = []
        if (blk.top) faces.push([0, 0.46, 1, 0.1])
        if (blk.openLeft) faces.push([-0.46, 0, 0.1, 1])
        if (blk.openRight) faces.push([0.46, 0, 0.1, 1])
        for (const [fx, fy, w, h] of faces) {
          d.position.set(blk.x + fx, -blk.y + fy, FRONT - 0.2)
          d.scale.set(w, h, 0.55)
          d.updateMatrix()
          tr.setMatrixAt(n.tr, d.matrix)
          tr.setColorAt(n.tr, STEEL_TRIM)
          n.tr += 1
        }
        continue
      }

      // ---------- EARTH: rough and irregular ----------
      const strata = strataAt(blk.depthT)
      const shade = Math.min(1, blk.buried / 5)
      const rock = (extra: number) => {
        tint.copy(blk.top ? strata.surface : strata.body).lerp(EARTH_DEEP, shade)
        return tint.multiplyScalar(0.8 + extra * 0.34)
      }

      const depth = DEPTH + blk.n * 1.4
      d.position.set(blk.x, -blk.y, FRONT - 0.22 - depth / 2)
      d.scale.set(1, 1, depth)
      d.rotation.set(0, 0, 0)
      d.updateMatrix()
      eb.setMatrixAt(n.eb, d.matrix)
      eb.setColorAt(n.eb, rock(blk.n * 0.6))
      n.eb += 1

      for (let q = 0; q < 4; q++) {
        const qx = (q % 2) - 0.5
        const qy = (q < 2 ? 1 : 0) - 0.5
        const h1 = hash(blk.x * 2 + (q % 2), blk.y * 2 + (q < 2 ? 1 : 0), 11)
        const h2 = hash(blk.x, blk.y, 20 + q)
        const out = 0.12 + h1 * 0.3
        d.position.set(blk.x + qx * 0.5, -blk.y + qy * 0.5, FRONT - out / 2)
        d.scale.set(0.52 + h2 * 0.06, 0.52 + h1 * 0.06, out)
        d.rotation.set(0, 0, (h2 - 0.5) * 0.1)
        d.updateMatrix()
        ep.setMatrixAt(n.ep, d.matrix)
        ep.setColorAt(n.ep, rock(h1))
        n.ep += 1
      }

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
          sc.setMatrixAt(n.sc, d.matrix)
          sc.setColorAt(n.sc, rock(0.25 + g * 0.5))
          n.sc += 1
        }
      }

      if (blk.top) {
        d.position.set(blk.x, -blk.y + 0.46, FRONT - 0.22)
        d.scale.set(1, 0.11, 0.55)
        d.rotation.set(0, 0, 0)
        d.updateMatrix()
        lp.setMatrixAt(n.lp, d.matrix)
        lp.setColorAt(n.lp, strata.crown)
        n.lp += 1

        const g = hash(blk.x, blk.y, 3)
        if (g > 0.86) {
          const h = 0.3 + g * 0.5
          d.position.set(blk.x + (g - 0.86) * 2 - 0.15, -blk.y + 0.5 + h / 2, FRONT - 0.5)
          d.scale.set(0.14, h, 0.14)
          d.rotation.set(0, g * 2, (g - 0.9) * 1.2)
          d.updateMatrix()
          cy.setMatrixAt(n.cy, d.matrix)
          cy.setColorAt(n.cy, CRYSTAL)
          n.cy += 1
        }
      }
    }

    const pairs: [InstancedMesh, number][] = [
      [eb, n.eb],
      [ep, n.ep],
      [sc, n.sc],
      [lp, n.lp],
      [cy, n.cy],
      [sb, n.sb],
      [pa, n.pa],
      [ri, n.ri],
      [tr, n.tr],
    ]
    for (const [m, count] of pairs) {
      m.count = count
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [blocks])

  const cells = world.width * world.height
  return (
    <group>
      {/* ---------- earth ---------- */}
      <instancedMesh ref={earthBulk} args={[undefined, undefined, cells]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.85} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={earthPlates} args={[undefined, undefined, cells * 4]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.78} metalness={0.06} flatShading />
      </instancedMesh>
      <instancedMesh ref={scree} args={[undefined, undefined, cells * 9]} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.9} metalness={0.03} flatShading />
      </instancedMesh>
      <instancedMesh ref={lip} args={[undefined, undefined, cells]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.5}
          emissive="#2e6f8c"
          emissiveIntensity={0.45}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={crystal} args={[undefined, undefined, cells]} castShadow>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial
          roughness={0.2}
          metalness={0.35}
          emissive="#1f7a63"
          emissiveIntensity={0.85}
          toneMapped={false}
          flatShading
        />
      </instancedMesh>

      {/* ---------- steel: smooth, panelled, unmistakably built ---------- */}
      <instancedMesh ref={steelBulk} args={[undefined, undefined, cells]} receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.5} metalness={0.6} />
      </instancedMesh>
      <instancedMesh ref={panels} args={[undefined, undefined, cells]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.28} metalness={0.88} />
      </instancedMesh>
      <instancedMesh ref={rivets} args={[undefined, undefined, cells * 4]}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshStandardMaterial roughness={0.22} metalness={0.95} />
      </instancedMesh>
      <instancedMesh ref={trim} args={[undefined, undefined, cells * 3]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          roughness={0.4}
          metalness={0.5}
          emissive="#c47a12"
          emissiveIntensity={0.7}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}
