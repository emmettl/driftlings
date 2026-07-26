import { SKILL_IDS } from '../sim/types'
import { useGame } from '../store'
import { Minimap } from './Minimap'

// Label plus a plain explanation of what the skill actually does. The counts are
// otherwise baffling — FLOAT can read 10 while BASH reads 1 — and the reason is the
// distinction below: a trait attaches to one driftling, a terrain skill changes the
// level for everybody.
const SKILL_INFO: Record<string, { label: string; tip: string }> = {
  climber: {
    label: 'CLIMB',
    tip: 'Scales sheer walls. Sticks to that one driftling for good — so you get one per head.',
  },
  floater: {
    label: 'FLOAT',
    tip: 'Survives any drop. Sticks to that one driftling for good — so you get one per head.',
  },
  blocker: {
    label: 'BLOCK',
    tip: 'Plants itself and turns the others around. It is out of the game for good.',
  },
  basher: {
    label: 'BASH',
    tip: 'Tunnels sideways through earth — never steel. The tunnel stays open for everyone.',
  },
  digger: {
    label: 'DIG',
    tip: 'Digs straight down through earth — never steel. The hole stays open for everyone.',
  },
}

export function Hud() {
  const world = useGame((s) => s.world)
  useGame((s) => s.revision) // re-render as the sim advances
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const paused = useGame((s) => s.paused)
  const togglePause = useGame((s) => s.togglePause)
  const speed = useGame((s) => s.speed)
  const cycleSpeed = useGame((s) => s.cycleSpeed)
  const reset = useGame((s) => s.reset)
  const spec = useGame((s) => s.spec)
  const seed = useGame((s) => s.seed)
  const generating = useGame((s) => s.generating)
  const newGenerated = useGame((s) => s.newGenerated)
  const cameraMode = useGame((s) => s.cameraMode)
  const toggleCamera = useGame((s) => s.toggleCamera)

  const out = world.saved + world.lost

  return (
    <>
      <div className="hud">
        <div>
          <div className="stat">
            SAVED <b>{world.saved}</b> / {spec.quota}
          </div>
          <div className="sub">
            out {out} of {world.total} · lost {world.lost}
          </div>
        </div>
        <div className="title">
          {spec.name}
          {seed !== null && <span className="seedtag"> · seed {seed}</span>}
        </div>
        <div className="right">
          <button data-tip={paused ? 'Resume' : 'Pause'} onClick={togglePause}>
            {paused ? '▶' : '❚❚'}
          </button>
          <button data-tip="Speed: 1x, 2x, 4x" onClick={cycleSpeed}>
            {speed}×
          </button>
          <button
            data-tip={
              cameraMode === 'overview'
                ? 'Follow the action (drag the map to look around)'
                : 'Zoom out to the whole level'
            }
            onClick={toggleCamera}
          >
            {cameraMode === 'overview' ? '⤡' : '⤢'}
          </button>
          <button data-tip="Restart this level" onClick={reset}>
            ↻
          </button>
          <button data-tip="A fresh generated level" onClick={newGenerated} disabled={generating}>
            {generating ? '…' : '✦'}
          </button>
        </div>
      </div>

      <div className="skills">
        {SKILL_IDS.map((id) => {
          const left = world.skills[id]
          return (
            <button
              key={id}
              className={`skill ${selected === id ? 'on' : ''}`}
              data-tip={SKILL_INFO[id].tip}
              disabled={left <= 0}
              onClick={() => select(id)}
            >
              <span className="n">{left}</span>
              <span className="l">{SKILL_INFO[id].label}</span>
            </button>
          )
        })}
      </div>

      <Minimap />

      {/* Doubles as the touch story: there is no hover on a phone, so the selected
          skill explains itself down here instead. */}
      <div className="hint">
        {selected
          ? `${SKILL_INFO[selected].tip}  —  now tap a driftling`
          : 'pick a skill, then tap a driftling'}
      </div>

      {world.finished && (
        <div className="end">
          <div className="end-card">
            <h2>{world.saved >= spec.quota ? 'LEVEL CLEAR' : 'NOT ENOUGH SAVED'}</h2>
            <p>
              {world.saved} saved · {world.lost} lost
            </p>
            <button className="again" onClick={reset}>
              TRY AGAIN
            </button>
            <button className="again alt" onClick={newGenerated}>
              NEW LEVEL
            </button>
          </div>
        </div>
      )}
    </>
  )
}
