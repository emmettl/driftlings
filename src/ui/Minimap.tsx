import { useEffect, useRef } from 'react'
import { CELL } from '../sim/types'
import { viewport } from '../game/viewport'
import { useGame } from '../store'

// A whole-level map, so zooming in on the action never means losing track of the
// crowd. Drawn on a canvas and repainted from a frame loop rather than from React —
// driftlings move every tick and nothing here should cause a re-render.
const SCALE = 3

export function Minimap() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const world = useGame((s) => s.world)

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    el.width = world.width * SCALE
    el.height = world.height * SCALE

    let raf = 0
    const paint = () => {
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.fillStyle = 'rgba(8,10,26,0.82)'
      ctx.fillRect(0, 0, el.width, el.height)

      for (let y = 0; y < world.height; y++) {
        for (let x = 0; x < world.width; x++) {
          const c = world.cells[y * world.width + x]
          if (c === CELL.EMPTY) continue
          ctx.fillStyle =
            c === CELL.STEEL
              ? '#6d5da8'
              : c === CELL.EXIT
                ? '#8affc1'
                : c === CELL.ENTRANCE
                  ? '#ff7ad9'
                  : '#2c4670'
          ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE)
        }
      }

      for (const d of world.driftlings) {
        if (d.activity === 'dead' || d.activity === 'saved') continue
        ctx.fillStyle = d.activity === 'blocker' ? '#ff7ad9' : '#ffd479'
        ctx.fillRect(d.x * SCALE - 1, d.y * SCALE - 1, SCALE + 1, SCALE + 1)
      }

      // What the camera is currently showing.
      ctx.strokeStyle = 'rgba(75,224,255,0.85)'
      ctx.lineWidth = 1
      ctx.strokeRect(
        (viewport.x - viewport.halfW) * SCALE,
        (viewport.y - viewport.halfH) * SCALE,
        viewport.halfW * 2 * SCALE,
        viewport.halfH * 2 * SCALE,
      )

      raf = requestAnimationFrame(paint)
    }
    raf = requestAnimationFrame(paint)
    return () => cancelAnimationFrame(raf)
  }, [world])

  return <canvas className="minimap" ref={canvas} />
}
