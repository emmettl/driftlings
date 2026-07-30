import { SKILL_IDS } from '../sim/types'
import { canAssign } from '../sim/step'
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
  bomber: {
    label: 'BOMB',
    tip: 'Counts down, then blasts away nearby earth. Steel survives; the bomber does not.',
  },
  blocker: {
    label: 'BLOCK',
    tip: 'Plants itself and turns the others around. It is out of the game for good.',
  },
  builder: {
    label: 'BUILD',
    tip: 'Builds a twelve-step staircase in the direction it is facing.',
  },
  basher: {
    label: 'BASH',
    tip: 'Tunnels sideways through earth — never steel. The tunnel stays open for everyone.',
  },
  miner: {
    label: 'MINE',
    tip: 'Cuts diagonally down through earth — useful when straight down is the wrong way.',
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
  const muted = useGame((s) => s.muted)
  const toggleMuted = useGame((s) => s.toggleMuted)
  const speed = useGame((s) => s.speed)
  const cycleSpeed = useGame((s) => s.cycleSpeed)
  const reset = useGame((s) => s.reset)
  const spec = useGame((s) => s.spec)
  const seed = useGame((s) => s.seed)
  const generating = useGame((s) => s.generating)
  const newGenerated = useGame((s) => s.newGenerated)
  const watching = useGame((s) => s.watching)
  const watch = useGame((s) => s.watch)
  const applySkillToWatched = useGame((s) => s.applySkillToWatched)
  const cameraMode = useGame((s) => s.cameraMode)
  const toggleCamera = useGame((s) => s.toggleCamera)

  // "Out" is a genre term and means what it means in Lemmings: released from the
  // hatch and still going. It used to be saved + lost, which is very nearly the
  // opposite — the counter sat on 0 while ten of them wandered around the level.
  const out = world.driftlings.filter(
    (d) => d.activity !== 'saved' && d.activity !== 'dead',
  ).length

  // The driftling under inspection, if it is still going. Selecting one points the
  // skill bar at it: the buttons say what THIS driftling can be told to do, which is
  // also where the rules become visible — a faller cannot be made a blocker, and a
  // driftling that already climbs cannot be given a second pair of boots.
  const subject = watching === null ? null : world.driftlings.find((d) => d.id === watching)
  const alive = subject && subject.activity !== 'dead' && subject.activity !== 'saved' ? subject : null
  const traits = alive
    ? [alive.isClimber ? 'climbs' : null, alive.isFloater ? 'floats' : null].filter(Boolean)
    : []

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
          <button data-tip={muted ? 'Turn music on' : 'Mute music'} onClick={toggleMuted}>
            {muted ? '♩' : '♫'}
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
          // With somebody selected, the button is only live if the rules allow that
          // skill on that driftling right now.
          const allowed = alive ? canAssign(alive, id) : true
          const disabled = left <= 0 || !allowed
          return (
            <button
              key={id}
              data-skill={id}
              className={`skill ${selected === id && !alive ? 'on' : ''}`}
              data-tip={SKILL_INFO[id].tip}
              disabled={disabled}
              onClick={() => (alive ? applySkillToWatched(id) : select(id))}
            >
              <span className="n">{left}</span>
              <span className="l">{SKILL_INFO[id].label}</span>
            </button>
          )
        })}
      </div>

      <Minimap />

      {alive && (
        <div className="subject">
          <span className="subject-dot" />
          <b>watching</b> · {alive.activity}
          {alive.activity === 'bomber' && <span className="subject-traits"> · {alive.work}</span>}
          {traits.length > 0 && <span className="subject-traits"> · {traits.join(' · ')}</span>}
          <button className="subject-drop" onClick={() => watch(null)}>
            release
          </button>
        </div>
      )}

      {/* Doubles as the touch story: there is no hover on a phone, so the selected
          skill explains itself down here instead. */}
      <div className="hint">
        {alive
          ? 'the camera is on this one — pick a skill to give it, or tap elsewhere to let go'
          : selected
            ? `${SKILL_INFO[selected].tip}  —  now tap a driftling`
            : 'tap a driftling to watch it, or pick a skill first'}
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
