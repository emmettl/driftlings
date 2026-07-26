# Driftlings

A Lemmings-like in 2.5D with an 8-bit chillwave finish. Gameplay is strictly 2D —
the simulation never knows about the third dimension — but the level is drawn as an
extruded diorama, which keeps the puzzle legible while still looking dimensional.

*(Working title; rename freely.)*

```bash
npm install
npm run dev

npm run lint     # oxlint
npm test         # vitest — the simulation contract
npm run build    # type-check + production build
```

## Why the simulation looks the way it does

The point of this project is the **solver**, and that constrains everything below it:

- **Integer-only and tick-driven.** No floats, no `Math.random`, no wall-clock time.
  Two runs from the same start state produce byte-identical results, so a search can
  fork a world, explore a future, and trust the result.
- **Terrain is part of the state.** Bashers and diggers reshape the level, so the
  world hash covers the grid as well as the bodies — that is what makes this a real
  search problem rather than pathfinding.
- **Cheap to clone.** Terrain is a `Uint8Array`; a world copy is a slice and a small
  array map, because the solver will do it thousands of times a second.
- **No builder skill (yet).** A builder can place a staircase almost anywhere, which
  explodes the branching factor more than any other skill. Climber / floater /
  blocker / basher / digger is plenty of vocabulary to start with.

## Levels are ASCII

Readable in a diff, trivial to hand-author, and exactly what a generator will emit —
so humans and the machine speak the same format.

```
'#' earth (diggable)   '=' steel (indestructible)   '.' air
'E' entrance           'X' exit
```

## Structure

```
src/
  sim/        types, terrain, step (the state machine), world (create/clone/hash)
  levels/     hand-made levels as ASCII
  components/ Terrain + Driftlings (instanced), Scene (camera, ticker, lights)
  ui/         HUD and skill bar
```

## Where this is going

1. ~~Deterministic simulation + a hand-made level~~ ✅
2. **A solver** — can it prove this level solvable, and with which skills?
3. A generator that works *backwards from a solution*, so solvability is true by
   construction, verified by the solver.

The open question is not whether levels can be generated — it is whether generated
levels are any *fun*. That is what makes it worth finding out.
