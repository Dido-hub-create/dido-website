/** Viewport-space zoom: preserve aspect ratio, clamp panning to image edges. */
export function zoomState(state, scale, anchor, viewport, photo) {
  const next = Math.max(1, Math.min(4, scale));
  const ratio = next / state.scale;
  const bound = (value, size, view) => {
    const limit = Math.max(0, (size * next - view) / 2);
    return limit === 0 ? 0 : Math.max(-limit, Math.min(limit, value));
  };
  return {
    scale: next,
    x: bound(anchor.x + (state.x - anchor.x) * ratio, photo.width, viewport.width),
    y: bound(anchor.y + (state.y - anchor.y) * ratio, photo.height, viewport.height),
  };
}
