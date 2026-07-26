// Where the camera is currently looking, in level cell coordinates. Written by the
// camera rig each frame and read by the minimap, which needs to draw the viewport
// rectangle. Kept outside React because it changes every frame and nothing should
// re-render because of it.

export const viewport = {
  x: 0,
  y: 0,
  halfW: 10,
  halfH: 10,
}

export function setViewport(x: number, y: number, halfW: number, halfH: number): void {
  viewport.x = x
  viewport.y = y
  viewport.halfW = halfW
  viewport.halfH = halfH
}
