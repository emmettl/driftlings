// Seeded RNG. The generator must be reproducible: a seed is the whole identity of a
// level, so a level can be shared, re-tested and regression-checked as a single number.
export function makeRng(seed: number) {
  let s = seed >>> 0
  return {
    /** [0, 1) */
    next(): number {
      s += 0x6d2b79f5
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    /** Integer in [lo, hi]. */
    int(lo: number, hi: number): number {
      return lo + Math.floor(this.next() * (hi - lo + 1))
    },
    pick<T>(items: readonly T[]): T {
      return items[this.int(0, items.length - 1)]
    },
  }
}

export type Rng = ReturnType<typeof makeRng>
