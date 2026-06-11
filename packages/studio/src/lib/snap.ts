import type { Vec2 } from "@sap-geometry/core";
import type { MassDesign } from "./types";

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

// ── Multi-mass snap utilities ───────────────────

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(p: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Nearest point on segment a→b to point p. */
export function nearestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Snap to nearby vertices or edges of other masses. Returns snap target or null. */
export function snapToMasses(
  p: Vec2,
  masses: MassDesign[],
  excludeId: string | null,
  tolerance: number,
): Vec2 | null {
  let bestDist = tolerance;
  let bestPoint: Vec2 | null = null;

  for (const mass of masses) {
    if (mass.id === excludeId || !mass.closed || mass.vertices.length < 2)
      continue;

    // Check vertices first (higher priority)
    for (const v of mass.vertices) {
      const d = Math.hypot(p[0] - v[0], p[1] - v[1]);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = v;
      }
    }
  }

  // If we found a vertex snap, use it
  if (bestPoint) return bestPoint;

  // Check edges
  bestDist = tolerance;
  for (const mass of masses) {
    if (mass.id === excludeId || !mass.closed || mass.vertices.length < 2)
      continue;

    const verts = mass.vertices;
    for (let i = 0; i < verts.length; i++) {
      const j = (i + 1) % verts.length;
      const nearest = nearestPointOnSegment(p, verts[i], verts[j]);
      const d = Math.hypot(p[0] - nearest[0], p[1] - nearest[1]);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = nearest;
      }
    }
  }

  return bestPoint;
}
