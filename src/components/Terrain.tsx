import { useLayoutEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { CELL } from '../sim/types'
import type { World } from '../sim/types'

// Gameplay is strictly 2D (the sim never knows about z), but each cell is drawn as
// a extruded block so the level reads as a solid diorama rather than a tilemap.
// Instancing keeps it to one draw call however big the level gets.

const DEPTH = 3.2
const EARTH = new Color('#2b3f6b')
const EARTH_TOP = new Color('#5fd6ff')
const STEEL = new Color('#7a6ba8')

export function Terrain({ world, revision }: { world: World; revision: number }) {
  const mesh = useRef<InstancedMesh>(null)

  // Which cells are solid — recomputed when the terrain is carved.
  const blocks = useMemo(() => {
    const out: { x: number; y: number; kind: number; lit: boolean }[] = []
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        const c = world.cells[y * world.width + x]
        if (c !== CELL.EARTH && c !== CELL.STEEL) continue
        // A cell with open air above catches the light — cheap edge definition.
        const lit = y === 0 || world.cells[(y - 1) * world.width + x] === CELL.EMPTY
        out.push({ x, y, kind: c, lit })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, revision])

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new Object3D()
    blocks.forEach((b, i) => {
      dummy.position.set(b.x, -b.y, 0)
      dummy.scale.set(1, 1, DEPTH)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      const base = b.kind === CELL.STEEL ? STEEL : b.lit ? EARTH_TOP : EARTH
      m.setColorAt(i, base)
    })
    m.count = blocks.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [blocks])

  return (
    <instancedMesh
      ref={mesh}
      // Allocate for the whole grid so carving never needs a realloc.
      args={[undefined, undefined, world.width * world.height]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.65} metalness={0.15} />
    </instancedMesh>
  )
}
