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

## The solver

`solver/solve.ts` answers the question generation depends on: **can one driftling get
from the entrance to the exit, and with which skills?** In a level where everyone
spawns in the same place, a route that works for one works for the crowd; crowd
management (blockers holding others back) is a separate layer on top.

It is a uniform-cost search over `(position, facing, activity, traits, carved terrain,
skills left)`, ordered to spend **as few skills as possible**, tie-broken by fewest
steps. Terrain is part of the state — bashers and diggers reshape it — which is what
makes this search rather than pathfinding. Nodes carry only a list of carved cell
indices rather than a copy of the grid, so they stay cheap to hash and store.

It moves the driftling with the game's own `advanceDriftling`, so a route it finds is
one the real game reproduces. `solver/replay.ts` then re-walks the plan independently
and checks it reaches the exit — a solver that convinces itself of an unwalkable route
gets caught.

### Measured cost

| case | expansions | time |
|---|--:|--:|
| hand-made level, solvable | 398 | 4 ms |
| flat corridor, width 120 | 123 | 1 ms |
| **unsolvable** (sealed exit), 1 of each skill | 7,738 | 15 ms |
| **unsolvable**, 3 of each skill | 26,580 | 33 ms |

Two findings that matter:

- **A generous inventory does not blow up the search.** 398 expansions whether the
  level grants one of each skill or four, because the cost function finds the cheap
  route before it explores expensive ones.
- **The worst case — proving a level unsolvable, where the search must exhaust
  everything reachable — grows roughly linearly in inventory size, not
  exponentially.** ~30 ms on a small level.

That makes generate-and-verify comfortably affordable: tens of candidate levels per
second, each *proved* solvable rather than hoped to be. (Caveat: measured on small
levels; a large level with a big inventory and no solution is the case to watch.)

## Where this is going

1. ~~Deterministic simulation + a hand-made level~~ ✅
2. ~~A solver that proves solvability and finds the minimum skill set~~ ✅
3. A generator working *backwards from a solution*, so solvability is true by
   construction — with the solver used in the other direction, to reject levels that
   are solvable *too easily* (no skills needed) or only one way.

The open question was never whether levels can be generated. It is whether generated
levels are any *fun* — and the solver gives us the first real handle on that, because
"how many distinct routes" and "how many skills are forced" are measurable.
