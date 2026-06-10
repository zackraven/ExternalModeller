import type { Vec2, Vec3 } from "./types.js";

const SNAP = 1e-4;
const EPS = 1e-6;

/** Snap a value to the grid defined by SNAP tolerance. */
export function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

/** Snap a Vec3 coordinate. */
export function snapVec3(v: Vec3): Vec3 {
  return [snap(v[0]), snap(v[1]), snap(v[2])];
}

// ── Vector ops ──────────────────────────────────────────────

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < EPS) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ── 2D helpers ──────────────────────────────────────────────

/** Rotate a 2D vector 90° clockwise: (x,y) → (y, -x). */
export function rotateCW90(d: Vec2): Vec2 {
  return [d[1], -d[0]];
}

/**
 * Signed area of a 2D polygon (shoelace formula).
 * Positive = CCW, negative = CW.
 */
export function shoelace(poly: Vec2[]): number {
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i][0] * poly[j][1];
    area -= poly[j][0] * poly[i][1];
  }
  return area / 2;
}

/** Returns true if the polygon is wound counter-clockwise (positive shoelace area). */
export function isCCW(poly: Vec2[]): boolean {
  return shoelace(poly) > 0;
}

/** Ensure CCW winding. Returns a new array if reversed, otherwise the same reference. */
export function ensureCCW(poly: Vec2[]): Vec2[] {
  if (isCCW(poly)) return poly;
  return [...poly].reverse();
}

// ── Newell's method (3D polygon area + normal) ──────────────

/**
 * Compute the area and outward normal of a 3D polygon via Newell's method.
 * The normal direction follows the vertex winding (right-hand rule).
 */
export function newell(vertices: Vec3[]): { area: number; normal: Vec3 } {
  const n = vertices.length;
  let nx = 0,
    ny = 0,
    nz = 0;

  for (let i = 0; i < n; i++) {
    const cur = vertices[i];
    const next = vertices[(i + 1) % n];
    nx += (cur[1] - next[1]) * (cur[2] + next[2]);
    ny += (cur[2] - next[2]) * (cur[0] + next[0]);
    nz += (cur[0] - next[0]) * (cur[1] + next[1]);
  }

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len < EPS) {
    return { area: 0, normal: [0, 0, 1] };
  }

  return {
    area: len / 2,
    normal: [nx / len, ny / len, nz / len],
  };
}

// ── Orientation helpers ─────────────────────────────────────

/**
 * Azimuth of a face normal in degrees [0, 360).
 * Follows the convention: atan2(n.x, n.y), then add northAngle.
 * North (+Y) = 0, East (+X) = 90, South (-Y) = 180, West (-X) = 270.
 */
export function azimuthOf(normal: Vec3, northAngle: number = 0): number {
  const deg = (Math.atan2(normal[0], normal[1]) * 180) / Math.PI;
  return ((deg + northAngle) % 360 + 360) % 360;
}

/**
 * Tilt of a face from horizontal in degrees [0, 180].
 * Vertical = 90, horizontal floor/roof = 0.
 */
export function tiltOf(normal: Vec3): number {
  const nz = Math.max(-1, Math.min(1, normal[2]));
  const angle = Math.acos(Math.abs(nz)) * (180 / Math.PI);
  return angle;
}

// ── Edge / distance helpers ─────────────────────────────────

/** Euclidean distance between two Vec3 points. */
export function dist3(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Perimeter of a 2D polygon. */
export function perimeter2D(poly: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const dx = poly[j][0] - poly[i][0];
    const dy = poly[j][1] - poly[i][1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}
