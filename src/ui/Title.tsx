import { useGame } from '../store'

export function Title() {
  const start = useGame((s) => s.startPlaying)
  return (
    <div className="title-screen">
      <h1 className="game-title">DRIFTLINGS</h1>
      <div className="game-sub">a small crowd, a long way down</div>
      <button className="btn-start" onClick={start}>
        BEGIN
      </button>
      <div className="title-foot">they are not very bright · that is the point</div>
    </div>
  )
}
