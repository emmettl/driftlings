import { CELL, type CellKind, type World } from './types'

export function idx(world: { width: number }, x: number, y: number): number {
  return y * world.width + x
}

export function inBounds(world: World, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height
}

export function cellAt(world: World, x: number, y: number): CellKind {
  // The level is bounded like a diorama: the left and right edges are solid, so a
  // walker turns around instead of strolling out of the world. Above is open sky,
  // and below the last row is out of play — falling off the bottom is a real loss.
  if (x < 0 || x >= world.width) return CELL.STEEL
  if (y < 0 || y >= world.height) return CELL.EMPTY
  return world.cells[idx(world, x, y)] as CellKind
}

/** Terrain that blocks movement and can be stood on. */
export function isSolid(world: World, x: number, y: number): boolean {
  const c = cellAt(world, x, y)
  return c === CELL.EARTH || c === CELL.STEEL
}

/** Terrain a basher or digger can remove. */
export function isDiggable(world: World, x: number, y: number): boolean {
  return cellAt(world, x, y) === CELL.EARTH
}

export function carve(world: World, x: number, y: number): void {
  if (!inBounds(world, x, y)) return
  if (world.cells[idx(world, x, y)] === CELL.EARTH) {
    world.cells[idx(world, x, y)] = CELL.EMPTY
  }
}

export function isExit(world: World, x: number, y: number): boolean {
  return cellAt(world, x, y) === CELL.EXIT
}

/** Has this driftling walked off the bottom of the level? */
export function belowFloor(world: World, y: number): boolean {
  return y >= world.height
}
