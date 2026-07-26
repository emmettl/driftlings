import { cpus } from 'node:os'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { generateLevel } from '../src/generator/generate'
import { verify } from '../src/generator/verify'
import type { LevelSpec } from '../src/sim/world'

// Offline level curation.
//
// Generating a good level costs a few hundred milliseconds, which is tolerable for a
// button press but caps how much compute we can spend judging one — and level size,
// which drives solver cost, was being chosen to keep the browser responsive rather
// than to make good levels. Doing this offline lifts that ceiling: we can afford to
// generate thousands of candidates, measure them properly, and ship only the best.
//
// It runs the SAME simulation and solver as the game, in Node, fanned out across
// cores. Re-implementing them in another language would be faster per core and would
// also reintroduce exactly the divergence this project is built to avoid — a curator
// that certifies levels against rules the game does not actually have.

export interface CuratedLevel {
  seed: number
  spec: LevelSpec
  score: number
  metrics: {
    skills: number
    steps: number
    alternatives: number
    firstDecisionAt: number
    spread: number
    saved: number
  }
}

/**
 * A single number standing in for "is this worth playing". It is a guess, and the
 * point of curating offline is that the guess can be revised cheaply and the whole
 * pack rebuilt.
 */
function score(m: CuratedLevel['metrics']): number {
  const forced = 1 / m.alternatives // one route is ideal
  const decisions = Math.min(m.skills, 5) / 5 // more to do, up to a point
  const early = 1 - m.firstDecisionAt // do not make them walk first
  const spread = Math.min(m.spread * 3, 1) // decisions through the level, not bunched
  const crowd = m.saved / 10
  return 0.3 * forced + 0.25 * decisions + 0.2 * early + 0.15 * spread + 0.1 * crowd
}

function evaluateRange(lo: number, hi: number): CuratedLevel[] {
  const out: CuratedLevel[] = []
  for (let seed = lo; seed < hi; seed++) {
    const level = generateLevel(seed)
    const v = verify(level)
    if (!v.ok || !v.analysis || !v.crowd) continue
    const metrics = {
      skills: v.analysis.skillsUsed,
      steps: v.analysis.steps,
      alternatives: Math.max(1, v.analysis.alternatives),
      firstDecisionAt: v.analysis.firstDecisionAt,
      spread: v.analysis.decisionSpread,
      saved: v.crowd.saved,
    }
    out.push({ seed, spec: level.spec, score: score(metrics), metrics })
  }
  return out
}

// --- worker mode -------------------------------------------------------------
//
// The coordinator below forks THIS file. A worker must therefore never reach that
// code, or it forks a generation of its own: 13 workers become 169 become 2197, and
// the machine goes down. That guarantee used to rest on a synchronous `process.exit`
// happening to be reached, which is far too thin a thread to hang it on — so the two
// modes are now separated by an explicit branch instead.

const workerFlag = process.argv.indexOf('--worker')

async function runWorker(lo: number, hi: number): Promise<void> {
  const found = evaluateRange(lo, hi)
  // process.send is asynchronous, so exiting on the next line truncates the payload:
  // every worker then reports an empty result and the run reads as "accepted 0/2000"
  // rather than as a failure. Wait for the channel to flush.
  await new Promise<void>((done) => {
    if (!process.send) return done()
    process.send(found, undefined, undefined, () => done())
  })
}

async function runCoordinator(): Promise<void> {
  const arg = (name: string, fallback: number): number => {
    const i = process.argv.indexOf(name)
    return i === -1 ? fallback : Number(process.argv[i + 1])
  }

  const candidates = arg('--candidates', 2000)
  const keep = arg('--keep', 40)
  const jobs = arg('--jobs', Math.max(1, cpus().length - 1))
  const self = fileURLToPath(import.meta.url)

  const chunk = Math.ceil(candidates / jobs)
  const started = Date.now()
  console.log(`curating ${candidates} candidates across ${jobs} cores…`)

  const results = await Promise.all(
    Array.from({ length: jobs }, (_, i) => {
      const lo = 1 + i * chunk
      const hi = Math.min(1 + candidates, lo + chunk)
      return new Promise<CuratedLevel[]>((res, rej) => {
        const child = fork(self, ['--worker', String(lo), String(hi)], {
          silent: false,
          // Second line of defence against a child ever coordinating: even if it
          // somehow reached that code, this stops it forking. See the note above.
          env: { ...process.env, CURATE_WORKER: '1' },
        })
        let payload: CuratedLevel[] = []
        child.on('message', (m) => {
          payload = m as CuratedLevel[]
        })
        child.on('exit', (code) => (code === 0 ? res(payload) : rej(new Error(`worker ${code}`))))
      })
    }),
  )

  const all = results.flat().sort((a, b) => b.score - a.score)
  // Ship the best, ordered easiest-first so a pack reads as a progression.
  const pack = all
    .slice(0, keep)
    .sort((a, b) => a.metrics.skills - b.metrics.skills || a.score - b.score)

  // Never overwrite a good pack with an empty one. A curation run that returns
  // nothing is a broken run, not a verdict that no level is any good — and the
  // previous pack is the only copy of a lot of offline compute.
  if (pack.length === 0) {
    console.error('curation produced no levels — leaving the existing pack alone')
    process.exitCode = 1
    return
  }

  const outPath = resolve(dirname(self), '../src/levels/pack.json')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        generated: candidates,
        kept: pack.length,
        levels: pack.map((l) => ({ seed: l.seed, spec: l.spec, metrics: l.metrics })),
      },
      null,
      1,
    )}\n`,
  )

  const secs = (Date.now() - started) / 1000
  const avg = (f: (l: CuratedLevel) => number) =>
    all.reduce((s, l) => s + f(l), 0) / Math.max(1, all.length)
  console.log(
    `accepted ${all.length}/${candidates} (${((all.length / candidates) * 100).toFixed(0)}%) in ` +
      `${secs.toFixed(1)}s — ${(candidates / secs).toFixed(0)} candidates/sec`,
  )
  console.log(
    `pool avg: skills=${avg((l) => l.metrics.skills).toFixed(1)} ` +
      `alts=${avg((l) => l.metrics.alternatives).toFixed(1)} ` +
      `first=${avg((l) => l.metrics.firstDecisionAt).toFixed(2)}`,
  )
  const best = pack[pack.length - 1]
  console.log(`kept top ${pack.length}; best score ${best?.score.toFixed(3)} (seed ${best?.seed})`)
  console.log(`wrote ${outPath}`)
}

// One mode or the other, never both.
if (workerFlag !== -1) {
  await runWorker(Number(process.argv[workerFlag + 1]), Number(process.argv[workerFlag + 2]))
} else if (process.env.CURATE_WORKER === '1') {
  console.error('refusing to coordinate: this process was forked as a worker')
  process.exitCode = 1
} else {
  await runCoordinator()
}
