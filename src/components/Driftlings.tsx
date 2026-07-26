import { useLayoutEffect, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import type { Driftling, World } from '../sim/types'

const ACTIVITY_COLOR: Record<string, Color> = {
  walker: new Color('#ffd479'),
  faller: new Color('#ffb35c'),
  floater: new Color('#8affc1'),
  climber: new Color('#9ad8ff'),
  blocker: new Color('#ff7ad9'),
  basher: new Color('#ff9f6b'),
  digger: new Color('#ffe066'),
}

// Drawn slightly in front of the terrain slab so they always read clearly against it.
const Z = 2.1

export function Driftlings({ world, revision }: { world: World; revision: number }) {
  const mesh = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = mesh.current
    if (!m) return
    const dummy = new Object3D()
    const live: Driftling[] = world.driftlings.filter(
      (d) => d.activity !== 'saved' && d.activity !== 'dead',
    )
    live.forEach((d, i) => {
      dummy.position.set(d.x, -d.y, Z)
      // Blockers plant themselves wider; everyone else is a small upright capsule.
      const wide = d.activity === 'blocker'
      dummy.scale.set(wide ? 0.85 : 0.55, 0.9, 0.55)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      m.setColorAt(i, ACTIVITY_COLOR[d.activity] ?? ACTIVITY_COLOR.walker)
    })
    m.count = live.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [world, revision])

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, Math.max(1, world.total)]} castShadow>
      <capsuleGeometry args={[0.5, 0.6, 4, 8]} />
      {/* Flat and untonemapped so the per-instance colours stay punchy and trip
          the bloom threshold — emissive would have to be uniform, which would
          wash every driftling to the same white. */}
      <meshStandardMaterial roughness={0.35} metalness={0.1} toneMapped={false} />
    </instancedMesh>
  )
}
