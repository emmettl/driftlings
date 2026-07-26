import { useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import { smoothX, smoothY } from '../game/interpolate'
import type { Activity, Driftling, World } from '../sim/types'

// Driftlings are little voxel figures rather than capsules: a head, a torso, two arms
// and two legs, to match the blocky terrain. Each body part is its own InstancedMesh,
// so the whole crowd still costs one draw call per part however many are on screen.
//
// Because this is a side-on view, the paired limbs are separated in DEPTH (z) and
// swing along the direction of travel (x) — that is what reads as walking from here.

const BODY: Record<Activity, string> = {
  walker: '#ffd479',
  faller: '#ffb35c',
  floater: '#8affc1',
  climber: '#9ad8ff',
  blocker: '#ff7ad9',
  basher: '#ff9f6b',
  digger: '#ffe066',
  saved: '#ffffff',
  dead: '#555566',
}

const SKIN = new Color('#ffe9c9')
const LIMB = new Color('#3b3f6b')
const CANOPY = new Color('#8affc1')

const Z = 2.1 // in front of the terrain slab so they always read clearly

/** A pose: where each part sits, for the current activity. */
interface Pose {
  crouch: number
  lean: number
  armsOut: boolean
  legSwing: number
  armSwing: number
}

function poseFor(d: Driftling, t: number): Pose {
  const cycle = Math.sin(t * 9 + d.id * 1.7)
  switch (d.activity) {
    case 'walker':
      return { crouch: 0, lean: 0.04, armsOut: false, legSwing: cycle * 0.16, armSwing: -cycle * 0.12 }
    case 'faller':
      // Tucked and tumbling slightly.
      return { crouch: 0.06, lean: -0.08, armsOut: false, legSwing: 0.05, armSwing: 0.18 }
    case 'floater':
      // Hanging under the canopy, legs dangling.
      return { crouch: -0.04, lean: 0, armsOut: false, legSwing: cycle * 0.05, armSwing: 0.22 }
    case 'climber':
      // Pressed to the wall, reaching up.
      return { crouch: 0.05, lean: 0.12, armsOut: false, legSwing: cycle * 0.07, armSwing: 0.26 }
    case 'blocker':
      // Planted, arms wide — the pose that says "nobody passes".
      return { crouch: 0.08, lean: 0, armsOut: true, legSwing: 0, armSwing: 0 }
    case 'basher':
      // Leaning into the wall, arms forward.
      return { crouch: 0.05, lean: 0.16, armsOut: false, legSwing: 0, armSwing: 0.3 + cycle * 0.08 }
    case 'digger':
      // Hunched over, digging down.
      return { crouch: 0.18, lean: 0.1, armsOut: false, legSwing: 0, armSwing: 0.12 + cycle * 0.06 }
    default:
      return { crouch: 0, lean: 0, armsOut: false, legSwing: 0, armSwing: 0 }
  }
}

const PARTS = ['head', 'torso', 'armA', 'armB', 'legA', 'legB'] as const
type Part = (typeof PARTS)[number]

export function Driftlings({
  world,
  revision,
  watching,
}: {
  world: World
  revision: number
  watching?: number | null
}) {
  const refs = {
    head: useRef<InstancedMesh>(null),
    torso: useRef<InstancedMesh>(null),
    armA: useRef<InstancedMesh>(null),
    armB: useRef<InstancedMesh>(null),
    legA: useRef<InstancedMesh>(null),
    legB: useRef<InstancedMesh>(null),
  }
  const canopy = useRef<InstancedMesh>(null)
  const marker = useRef<InstancedMesh>(null)
  const hits = useRef<InstancedMesh>(null)
  const dummy = useRef(new Object3D()).current
  const tint = useRef(new Color()).current

  const build = (t: number) => {
    const live = world.driftlings.filter((d) => d.activity !== 'saved' && d.activity !== 'dead')
    let floaters = 0
    let markers = 0

    live.forEach((d, i) => {
      const p = poseFor(d, t)
      const face = d.dir // limbs swing along travel; the figure mirrors with it

      // Drawn part-way through its current step rather than snapped to a cell — see
      // game/interpolate. The camera uses the same helper, so the two never disagree.
      const ox = smoothX(d)
      // Feet sit at the bottom of the cell, so the figure stands on the surface.
      const oy = -smoothY(d) - 0.5
      tint.set(BODY[d.activity] ?? BODY.walker)

      const place = (part: Part, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
        const m = refs[part].current
        if (!m) return
        dummy.position.set(ox + x * face, oy + y, Z + z)
        dummy.scale.set(sx, sy, sz)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        m.setMatrixAt(i, dummy.matrix)
        m.setColorAt(i, part === 'head' ? SKIN : part === 'torso' ? tint : LIMB)
      }

      const lean = p.lean
      place('legA', p.legSwing, 0.18 - p.crouch, -0.13, 0.16, 0.36, 0.16)
      place('legB', -p.legSwing, 0.18 - p.crouch, 0.13, 0.16, 0.36, 0.16)
      place('torso', lean * 0.5, 0.56 - p.crouch, 0, 0.42, 0.42, 0.34)
      place('head', lean, 0.9 - p.crouch, 0, 0.34, 0.32, 0.32)
      if (p.armsOut) {
        place('armA', 0, 0.6 - p.crouch, -0.28, 0.34, 0.13, 0.13)
        place('armB', 0, 0.6 - p.crouch, 0.28, 0.34, 0.13, 0.13)
      } else {
        place('armA', p.armSwing, 0.56 - p.crouch, -0.26, 0.13, 0.3, 0.13)
        place('armB', -p.armSwing * 0.6, 0.56 - p.crouch, 0.26, 0.13, 0.3, 0.13)
      }

      // Anyone with the float trait carries a canopy, whether or not they are using
      // it right now — it is the readable sign that this one can survive the drop.
      if (d.isFloater && canopy.current) {
        dummy.position.set(ox, oy + (d.activity === 'floater' ? 1.5 : 1.32), Z)
        dummy.scale.set(d.activity === 'floater' ? 0.95 : 0.5, 0.12, 0.6)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        canopy.current.setMatrixAt(floaters, dummy.matrix)
        canopy.current.setColorAt(floaters, CANOPY)
        floaters += 1
      }

      // A ring over the one you are watching, so it stays findable in a crowd.
      if (d.id === watching && marker.current) {
        dummy.position.set(ox, oy + 1.55 + Math.sin(t * 3) * 0.06, Z)
        dummy.scale.setScalar(0.4)
        dummy.rotation.set(Math.PI / 2, 0, t * 1.4)
        dummy.updateMatrix()
        marker.current.setMatrixAt(markers, dummy.matrix)
        markers += 1
      }

      // Invisible pick target: one box per driftling, so a tap maps to a driftling
      // rather than to whichever limb happened to be in front.
      if (hits.current) {
        dummy.position.set(ox, oy + 0.55, Z)
        dummy.scale.set(0.9, 1.2, 0.9)
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        hits.current.setMatrixAt(i, dummy.matrix)
      }
    })

    for (const part of PARTS) {
      const m = refs[part].current
      if (!m) continue
      m.count = live.length
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
      m.computeBoundingSphere()
    }
    if (marker.current) {
      marker.current.count = markers
      marker.current.instanceMatrix.needsUpdate = true
      marker.current.computeBoundingSphere()
    }
    if (canopy.current) {
      canopy.current.count = floaters
      canopy.current.instanceMatrix.needsUpdate = true
      if (canopy.current.instanceColor) canopy.current.instanceColor.needsUpdate = true
      canopy.current.computeBoundingSphere()
    }
    if (hits.current) {
      hits.current.count = live.length
      hits.current.instanceMatrix.needsUpdate = true
      // Critical, not cosmetic: InstancedMesh.raycast() early-outs against the cached
      // bounding sphere, so a stale one makes the driftlings unclickable as well as
      // invisible. It is recomputed every frame because they are always moving.
      hits.current.computeBoundingSphere()
    }
  }

  // Rebuild on every frame so the limbs animate between simulation ticks, and again
  // whenever the world changes so a new driftling appears immediately.
  useFrame(({ clock }) => build(clock.elapsedTime))
  useLayoutEffect(() => build(0), [world, revision]) // eslint-disable-line react-hooks/exhaustive-deps

  const cap = Math.max(1, world.total)
  return (
    <group>
      {PARTS.map((part) => (
        <instancedMesh
          key={part}
          ref={refs[part]}
          args={[undefined, undefined, cap]}
          castShadow
          // Frustum culling must be off. An InstancedMesh computes its bounding sphere
          // once and caches it, and on the first frame no driftling has spawned yet —
          // so the sphere is computed from zero instances, comes out empty (radius -1),
          // and every driftling is culled for the rest of the run. They are a handful
          // of objects near the camera, so culling was never buying anything anyway.
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={0.45} metalness={0.05} toneMapped={false} />
        </instancedMesh>
      ))}

      <instancedMesh ref={canopy} args={[undefined, undefined, cap]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.4} toneMapped={false} transparent opacity={0.85} />
      </instancedMesh>

      {/* Selection ring over the driftling being watched. */}
      <instancedMesh ref={marker} args={[undefined, undefined, cap]} frustumCulled={false}>
        <torusGeometry args={[1, 0.16, 8, 20]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#8fe8ff"
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </instancedMesh>

      {/* Pick targets — invisible but still raycast. */}
      <instancedMesh ref={hits} args={[undefined, undefined, cap]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}
