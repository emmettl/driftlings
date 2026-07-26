import { SKILL_IDS } from '../sim/types'
import { useGame } from '../store'
import { firstLevel } from '../levels/handmade'

const LABEL: Record<string, string> = {
  climber: 'CLIMB',
  floater: 'FLOAT',
  blocker: 'BLOCK',
  basher: 'BASH',
  digger: 'DIG',
}

export function Hud() {
  const world = useGame((s) => s.world)
  useGame((s) => s.revision) // re-render as the sim advances
  const selected = useGame((s) => s.selected)
  const select = useGame((s) => s.select)
  const paused = useGame((s) => s.paused)
  const togglePause = useGame((s) => s.togglePause)
  const speed = useGame((s) => s.speed)
  const setSpeed = useGame((s) => s.setSpeed)
  const reset = useGame((s) => s.reset)

  const out = world.saved + world.lost

  return (
    <>
      <div className="hud">
        <div>
          <div className="stat">
            SAVED <b>{world.saved}</b> / {firstLevel.quota}
          </div>
          <div className="sub">
            out {out} of {world.total} · lost {world.lost}
          </div>
        </div>
        <div className="title">{firstLevel.name}</div>
        <div className="right">
          <button onClick={togglePause}>{paused ? '▶' : '❚❚'}</button>
          <button onClick={() => setSpeed(speed === 1 ? 3 : 1)}>{speed}×</button>
          <button onClick={reset}>↻</button>
        </div>
      </div>

      <div className="skills">
        {SKILL_IDS.map((id) => {
          const left = world.skills[id]
          return (
            <button
              key={id}
              className={`skill ${selected === id ? 'on' : ''}`}
              disabled={left <= 0}
              onClick={() => select(id)}
            >
              <span className="n">{left}</span>
              <span className="l">{LABEL[id]}</span>
            </button>
          )
        })}
      </div>

      <div className="hint">
        {selected ? `tap a driftling to make it ${LABEL[selected].toLowerCase()}` : 'pick a skill'}
      </div>

      {world.finished && (
        <div className="end">
          <div className="end-card">
            <h2>{world.saved >= firstLevel.quota ? 'LEVEL CLEAR' : 'NOT ENOUGH SAVED'}</h2>
            <p>
              {world.saved} saved · {world.lost} lost
            </p>
            <button className="again" onClick={reset}>
              TRY AGAIN
            </button>
          </div>
        </div>
      )}
    </>
  )
}
