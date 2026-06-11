import type { Vec2 } from "@sap-geometry/core";

/** Round a point to the nearest grid multiple. */
export function snapToGrid(p: Vec2, step: number): Vec2 {
  return [
    Math.round(p[0] / step) * step,
    Math.round(p[1] / step) * step,
  ];
}

/** Constrain point to horizontal or vertical from `last` when within tolerance. */
export function snapToOrtho(p: Vec2, last: Vec2, toleranceDeg: number): Vec2 {
  const dx = p[0] - last[0];
  const dy = p[1] - last[1];
  const angle = Math.abs(Math.atan2(dy, dx) * (180 / Math.PI));

  // Near horizontal (0 or 180 degrees)
  if (angle < toleranceDeg || angle > 180 - toleranceDeg) {
    return [p[0], last[1]];
  }
  // Near vertical (90 degrees)
  if (Math.abs(angle - 90) < toleranceDeg) {
    return [last[0], p[1]];
  }
  return p;
}

/** Grid-snap then ortho-snap a point. */
export function snapPoint(
  p: Vec2,
  last: Vec2 | null,
  step: number,
  orthoTolDeg: number,
): Vec2 {
  let snapped = snapToGrid(p, step);
  if (last) {
    snapped = snapToOrtho(snapped, last, orthoTolDeg);
  }
  return snapped;
}
