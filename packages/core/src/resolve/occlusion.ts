import type { Face, Vec2, Vec3 } from "../types.js";
import { snap, dot, shoelace } from "../geometry.js";

const EPS = 1e-6;

/**
 * Compute cross-mass face occlusion.
 *
 * For each pair of external faces from different masses that share a
 * geometric plane but face opposite directions, compute the overlapping
 * area via Sutherland-Hodgman polygon clipping and store it as
 * `occludedArea` on each face.
 */
export function computeOcclusion(faces: Face[]): void {
  const external = faces.filter((f) => f.tag.adjacency === "external");

  // Group by canonical plane key
  const groups = new Map<string, Face[]>();
  for (const face of external) {
    const key = canonicalPlaneKey(face);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(face);
  }

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    // Split by normal direction relative to canonical normal
    const cn = canonicalNormal(group[0].normal);
    const positive: Face[] = [];
    const negative: Face[] = [];

    for (const face of group) {
      if (dot(face.normal, cn) > 0) {
        positive.push(face);
      } else {
        negative.push(face);
      }
    }

    if (positive.length === 0 || negative.length === 0) continue;

    // Cross-mass pairs with opposite normals
    for (const a of positive) {
      for (const b of negative) {
        if (a.tag.mass === b.tag.mass) continue;

        const polyA = ensureCCW2D(projectFace2D(a, cn));
        const polyB = ensureCCW2D(projectFace2D(b, cn));

        const clipped = clipPolygon(polyA, polyB);
        if (clipped.length < 3) continue;

        const area = Math.abs(shoelace(clipped));
        if (area < EPS) continue;

        a.occludedArea = (a.occludedArea ?? 0) + area;
        b.occludedArea = (b.occludedArea ?? 0) + area;
      }
    }
  }

  // Clamp: occludedArea must not exceed face area
  for (const face of external) {
    if (face.occludedArea !== undefined) {
      face.occludedArea = Math.min(face.occludedArea, face.area);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

/**
 * Canonical normal: flip so that the first significant component is positive.
 * This ensures opposite-facing faces on the same plane produce the same key.
 */
function canonicalNormal(n: Vec3): Vec3 {
  for (let i = 0; i < 3; i++) {
    if (n[i] > EPS) return [n[0], n[1], n[2]];
    if (n[i] < -EPS) return [-n[0], -n[1], -n[2]];
  }
  return [n[0], n[1], n[2]];
}

/**
 * Plane key: snapped canonical normal + plane offset d = dot(cn, vertex).
 */
function canonicalPlaneKey(face: Face): string {
  const cn = canonicalNormal(face.normal);
  const nx = snap(cn[0]);
  const ny = snap(cn[1]);
  const nz = snap(cn[2]);
  const v = face.vertices[0];
  const d = snap(cn[0] * v[0] + cn[1] * v[1] + cn[2] * v[2]);
  return `${nx},${ny},${nz}|${d}`;
}

/**
 * Project face vertices to 2D by dropping the axis most aligned with
 * the canonical normal (same approach as viewer triangulate.ts).
 */
function projectFace2D(face: Face, cn: Vec3): Vec2[] {
  const ax = Math.abs(cn[0]);
  const ay = Math.abs(cn[1]);
  const az = Math.abs(cn[2]);

  if (az >= ax && az >= ay) {
    return face.vertices.map((v) => [v[0], v[1]] as Vec2);
  } else if (ay >= ax) {
    return face.vertices.map((v) => [v[0], v[2]] as Vec2);
  } else {
    return face.vertices.map((v) => [v[1], v[2]] as Vec2);
  }
}

/** Ensure CCW winding for a 2D polygon. */
function ensureCCW2D(poly: Vec2[]): Vec2[] {
  if (shoelace(poly) > 0) return poly;
  return [...poly].reverse();
}

// ── Sutherland-Hodgman polygon clipping ─────────────────────

/**
 * Returns true if point p is on the left side (inside) of directed
 * edge a→b, using the cross-product sign test.
 */
function isLeft(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
}

/**
 * Intersection of lines a→b and c→d.  Returns null if parallel.
 */
function lineIntersect2D(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const denom =
    (a[0] - b[0]) * (c[1] - d[1]) - (a[1] - b[1]) * (c[0] - d[0]);
  if (Math.abs(denom) < EPS) return null;
  const t =
    ((a[0] - c[0]) * (c[1] - d[1]) - (a[1] - c[1]) * (c[0] - d[0])) / denom;
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/**
 * Sutherland-Hodgman: clip `subject` polygon by convex `clip` polygon.
 * Both must be CCW.  Returns the intersection polygon (may be empty).
 */
export function clipPolygon(subject: Vec2[], clip: Vec2[]): Vec2[] {
  let output = [...subject];

  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) return [];
    const input = output;
    output = [];
    const edgeA = clip[i];
    const edgeB = clip[(i + 1) % clip.length];

    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const pIn = isLeft(edgeA, edgeB, p);
      const qIn = isLeft(edgeA, edgeB, q);

      if (pIn) {
        output.push(p);
        if (!qIn) {
          const ix = lineIntersect2D(edgeA, edgeB, p, q);
          if (ix) output.push(ix);
        }
      } else if (qIn) {
        const ix = lineIntersect2D(edgeA, edgeB, p, q);
        if (ix) output.push(ix);
      }
    }
  }

  return output;
}
