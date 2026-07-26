import { Color } from 'three'

// Every level was the same cave in the same light. A biome is picked from the level's
// seed, so each one has its own rock, sky and lighting — and because it comes from the
// seed it is stable: a level always looks like itself.
//
// IMPORTANT: only the *environment* varies. The colours that carry meaning are fixed
// across every biome — the amber hazard trim on undiggable steel, the green exit, the
// pink entrance, and the driftlings themselves. Varying those would make the game
// harder to read for the sake of decoration, which is the opposite of the point.

export interface Biome {
  name: string
  /** Three rock colours, from the surface down into the depths. */
  strata: { surface: Color; body: Color; crown: Color }[]
  /** What rock fades to when deeply buried. */
  deep: Color
  /** Sky and fog. */
  sky: Color
  /** Distant silhouettes. */
  backdrop: Color[]
  light: { key: Color; skyLight: Color; groundLight: Color; fill: Color }
}

const c = (hex: string) => new Color(hex)

export const BIOMES: Biome[] = [
  {
    name: 'Drift',
    strata: [
      { surface: c('#5fd6ff'), body: c('#3f6ea8'), crown: c('#9beeff') },
      { surface: c('#a071e8'), body: c('#4b3a86'), crown: c('#c9a6ff') },
      { surface: c('#ff8f6b'), body: c('#7d3a52'), crown: c('#ffc38f') },
    ],
    deep: c('#0e1630'),
    sky: c('#0a0a1a'),
    backdrop: [c('#1b2049'), c('#151a38'), c('#101228')],
    light: { key: c('#ffd0f0'), skyLight: c('#6a5cff'), groundLight: c('#100e26'), fill: c('#4be0ff') },
  },
  {
    name: 'Ember',
    strata: [
      { surface: c('#ffb457'), body: c('#a8552f'), crown: c('#ffd9a0') },
      { surface: c('#e0553f'), body: c('#7a2b2b'), crown: c('#ff9878') },
      { surface: c('#8f2340'), body: c('#4a1226'), crown: c('#d4557a') },
    ],
    deep: c('#1a0a12'),
    sky: c('#140609'),
    backdrop: [c('#3a1420'), c('#2a0e18'), c('#1c0810')],
    light: { key: c('#ffb27a'), skyLight: c('#ff6a3d'), groundLight: c('#240a10'), fill: c('#ff8a4b') },
  },
  {
    name: 'Glacier',
    strata: [
      { surface: c('#e8fbff'), body: c('#8fb8d6'), crown: c('#ffffff') },
      { surface: c('#7fd4f0'), body: c('#4a7fa8'), crown: c('#bdefff') },
      { surface: c('#3f6b9e'), body: c('#22375c'), crown: c('#7fa8d4') },
    ],
    deep: c('#0a1428'),
    sky: c('#060d1c'),
    backdrop: [c('#16294a'), c('#101f3a'), c('#0a1628')],
    light: { key: c('#dff2ff'), skyLight: c('#6fa8ff'), groundLight: c('#0a1424'), fill: c('#8fe0ff') },
  },
  {
    name: 'Verdant',
    strata: [
      { surface: c('#9ef0a8'), body: c('#3f8a5c'), crown: c('#d4ffdc') },
      { surface: c('#4fbf8f'), body: c('#256b52'), crown: c('#8fe8c4') },
      { surface: c('#2a7a6b'), body: c('#123b36'), crown: c('#5fbaa8') },
    ],
    deep: c('#081a16'),
    sky: c('#06120f'),
    backdrop: [c('#123028'), c('#0d241e'), c('#081815')],
    light: { key: c('#eaffe4'), skyLight: c('#5fd08f'), groundLight: c('#08201a'), fill: c('#6fe0b0') },
  },
  {
    name: 'Amethyst',
    strata: [
      { surface: c('#e0b0ff'), body: c('#7a4fb8'), crown: c('#f4dcff') },
      { surface: c('#a35fd6'), body: c('#4f2b80'), crown: c('#d4a0ff') },
      { surface: c('#5f2f8f'), body: c('#2a1247'), crown: c('#9f6fd0') },
    ],
    deep: c('#140a24'),
    sky: c('#0d0716'),
    backdrop: [c('#291447'), c('#1e0f36'), c('#150a26'), ],
    light: { key: c('#f0d8ff'), skyLight: c('#9a5fff'), groundLight: c('#150a26'), fill: c('#c78fff') },
  },
  {
    name: 'Rust',
    strata: [
      { surface: c('#e8c08a'), body: c('#9a6b45'), crown: c('#ffe0b8') },
      { surface: c('#b8763f'), body: c('#6b3f26'), crown: c('#e0a070') },
      { surface: c('#6b4030'), body: c('#33201a'), crown: c('#a06b50') },
    ],
    deep: c('#160e0a'),
    sky: c('#0f0a08'),
    backdrop: [c('#2e1e14'), c('#221610'), c('#170f0a')],
    light: { key: c('#ffe0bc'), skyLight: c('#c98a4f'), groundLight: c('#1a0f0a'), fill: c('#e0a464') },
  },
]

/** Stable choice of biome for a level. Hand-made levels (no seed) get the first. */
export function biomeFor(seed: number | null): Biome {
  if (seed === null) return BIOMES[0]
  return BIOMES[Math.abs(Math.floor(seed)) % BIOMES.length]
}
