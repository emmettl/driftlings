# Driftlings

**[Play it](https://emmettl.github.io/driftlings/)** — no install, runs in the browser.

A Lemmings-like in 2.5D with an 8-bit chillwave finish. Gameplay is strictly 2D —
the simulation never knows about the third dimension — but the level is drawn as an
extruded diorama, which keeps the puzzle legible while still looking dimensional.

*(Working title; rename freely.)*

```bash
npm install
npm run dev

npm run lint         # oxlint
npm test             # vitest — the simulation contract
npm run build        # type-check + production build

npm run curate       # regenerate the shipped level pack (offline, multicore)
npm run verify:pack  # re-prove every shipped level against the CURRENT rules
```

`verify:pack` matters more than it looks. Levels are verified once, offline, and then
trusted for ever — so a change to the rules in `src/sim` can silently invalidate the
pack that ships. Run it after touching the simulation or the solver.

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

## Judging levels, not just validating them

"Solvable" is a low bar. `generator/analyse.ts` uses the solver as a **taste
instrument** — measuring properties that fun tends to require, even though it cannot
measure fun:

- **alternatives** — how many distinct minimum-skill routes exist. One means tightly
  forced; a dozen means nothing you do really matters.
- **firstDecisionAt** — where the first skill is spent, as a fraction of the route. A
  level whose only decision is at the end is a corridor with a puzzle stapled on.
- **criticalSkills / slackSkills** — take each granted skill away and re-solve. A skill
  the level survives without is padding.

Levels are rejected as `thin`, `back-loaded` or `mushy` on top of the correctness
verdicts. Measuring this changed the generator rather than just filtering it: beats
were silently degrading into free walking when they did not fit the available height,
which is what produced levels with one late decision. Now a demand that does not fit
is swapped for another *demand*, and the sequence opens on one.

| | before | after |
|---|--:|--:|
| decisions per level | 1.9 | **2.7** |
| first decision at | 0.36 | **0.21** |
| distinct routes (mushiness) | 2.0 | **1.6** |
| steps of walking | ~78 | ~67 |

`thin` and `back-loaded` rejections disappeared entirely — the fault was upstream, and
worth fixing rather than screening out. Full verification costs ~20 ms per candidate
(the analysis re-solves once per granted skill), ~65% are accepted.

## Shape: the route folds

Levels used to run left-to-right in a single band, which made them corridors by
construction — a queue of obstacles rather than a place. The route is now
**serpentine**: when it runs out of width it drops to a lower band and doubles back.
The boundary walls do the turning for free, since out of bounds is solid, so a walker
that reaches the edge simply turns around.

| | corridor | serpentine |
|---|--:|--:|
| decisions per level | 2.7 | **3.0** |
| decision spread across the route | 0.14 | **0.30** |
| first decision at | 0.21 | 0.20 |

Two things this cost, both worth knowing:

- **Folding creates shortcuts.** Stacking bands vertically means a driftling can fall
  past a band and skip its demands, so `shortcut` rejections roughly doubled and
  acceptance fell from ~65% to ~25%. The gate screens them out, so the levels that
  ship are still fully forced — folding just makes the generator wrong more often.
- **Bands must be kept apart.** A climb or a dig spans several rows; when bands sat
  4–6 apart the two overwrote each other and sealed the route (acceptance briefly
  collapsed to 8%). Bands are now 9–12 apart with a ceiling that upward beats may not
  cross.

Level size is a real cost, not a free parameter: verification grows sharply with it,
and generation runs on the UI thread. At the shipped 40×44 the ✦ button takes **~315 ms
on average, ~680 ms worst case**; at 46×56 the same search took 870 ms and the test
suite went from 7 s to 212 s. The suite therefore exercises small levels, and the
defaults are chosen to keep generation interactive.

## The crowd, not just the pioneer

The solver proves *one* driftling can reach the exit. The level is won by saving a
**quota**. Those are different claims, and for a while only the first was checked —
releasing the full crowd on levels the gate had accepted showed **0 of 14 were
winnable**. The pioneer got home; the other nine splatted or milled about forever.

The cause was skill accounting, not the simulation. Terrain skills change the level,
so one bash serves everyone — the tunnel stays open. **Climb and float are
per-driftling traits**, and granting the single copy the pioneer's route needed left
the rest of the crowd with no way down a lethal drop. Traits are now stocked per head,
while "forcing" still counts the route's needs so the shortcut check stays meaningful.
`solver/crowd.ts` releases everyone through the real tick-based sim, and a level that
cannot deliver a crowd is rejected as `unwinnable`. Accepted levels now save 10/10.

## Curating offline

Generating a good level costs a few hundred milliseconds. That is tolerable for a
button press, but it capped how much compute could be spent *judging* a level — and
level size, which drives solver cost, was being chosen to keep the browser responsive
rather than to make good levels.

`npm run curate` moves that offline: it fans candidates across cores and ships the best
as a static pack.

```bash
npm run curate -- --candidates 2000 --keep 40
# curating 2000 candidates across 13 cores…
# accepted 159/2000 (8%) in 17.4s — 115 candidates/sec
```

That is ~13× the single-threaded rate, and the game now loads a curated level
instantly instead of freezing the UI thread. Levels are scored on a composite of the
design metrics (forcedness, number of decisions, how early the first one lands, spread,
crowd survival) and shipped easiest-first.

**It runs the same TypeScript simulation and solver as the game, in Node.** Porting
them to Swift or Python for speed would buy a constant factor and reintroduce exactly
the divergence this project is built to avoid — a curator certifying levels against
rules the game does not actually have. Parallelism was the win here, not the language:
the work is embarrassingly parallel because every seed is independent.

## Where this is going

1. ~~Deterministic simulation + a hand-made level~~ ✅
2. ~~A solver that proves solvability and finds the minimum skill set~~ ✅
3. ~~A generator working *backwards from a solution*, so solvability is true by
   construction~~ ✅
4. ~~Solver-derived design metrics, and a quality bar built on them~~ ✅
5. ~~**Shape** — a serpentine route that folds back on itself instead of a single
   left-to-right chain~~ ✅
6. Next: **beats that interact**. Everything so far is a sequence of independent
   demands. The depth in Lemmings comes from a skill spent early changing what is
   reachable later — above all the blocker, which exists to turn *other* driftlings
   around. That needs the solver to reason about the crowd rather than one route, and
   it is the point where the state space genuinely grows: several bodies, not one.

The open question was never whether levels can be generated. It is whether generated
levels are any *fun* — and the metrics above are the first real handle on it, because
"how forced is this" and "when does the first decision arrive" turn out to be
measurable, and improving them measurably improved the levels.
