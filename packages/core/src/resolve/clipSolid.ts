/**
 * clipSolid — clips a closed polyhedron by a half-space plane.
 *
 * Keep region: dot(n, p) <= d.
 * Produces cap faces from intersection loops.
 */

import type { Vec2, Vec3 } from "../types.js";
import { cross, dot, sub, length, normalize, newell } from "../geometry.js";

const EPS = 1e-6;

// ── Types ────────────────────────────────────────────────────

export interface SolidFace {
  polygon: Vec3[];
  tags: Record<string, unknown>;
}

export interface Plane {
  n: Vec3;
  d: number;
}

export interface RoofCut {
  id: string;
  a: Vec2;
  b: Vec2;
  side: "left" | "right";
  pitch: number;       // degrees, 1–89.9
  eavesZ?: number;
}

// ── planeFromCut ─────────────────────────────────────────────

/**
 * Derive a normalized clip plane from a RoofCut.
 *
 * Keep region: dot(n, p) <= d.
 *
 * The plane passes through the eaves line at eavesZ (default wallTopZ)
 * and rises at the given pitch toward the 'side' of the directed line a→b.
 */
export function planeFromCut(cut: RoofCut, wallTopZ: number): Plane {
  const pitch = Math.max(1, Math.min(89.9, cut.pitch));
  const dx = cut.b[0] - cut.a[0];
  const dy = cut.b[1] - cut.a[1];
  const dirLen = Math.sqrt(dx * dx + dy * dy);
  if (dirLen < EPS) {
    throw new Error(`RoofCut "${cut.id}": a and b are coincident`);
  }
  const dirX = dx / dirLen;
  const dirY = dy / dirLen;

  // inward = direction the roof RISES toward
  let ix: number, iy: number;
  if (cut.side === "left") {
    ix = -dirY;
    iy = dirX;
  } else {
    ix = dirY;
    iy = -dirX;
  }

  const eZ = cut.eavesZ ?? wallTopZ;
  const tanP = Math.tan((pitch * Math.PI) / 180);

  // Unnormalized: N = (-tanP*ix, -tanP*iy, 1), D = eZ - tanP*dot(a, inward)
  const dotAInward = cut.a[0] * ix + cut.a[1] * iy;
  const Nx = -tanP * ix;
  const Ny = -tanP * iy;
  const Nz = 1;
  const D = eZ - tanP * dotAInward;

  const mag = Math.sqrt(Nx * Nx + Ny * Ny + Nz * Nz);
  return {
    n: [Nx / mag, Ny / mag, Nz / mag],
    d: D / mag,
  };
}

// ── clipSolid ────────────────────────────────────────────────

/**
 * Clip a closed polyhedron by a half-space plane.
 *
 * Input: faces of a closed polyhedron (outward normals), plane {n, d}.
 * Keep region: dot(n, p) <= d.
 * Output: clipped closed polyhedron.
 *
 * Cap faces are derived by finding boundary edges of the clipped solid
 * (directed edges with no twin in the opposite direction). These boundary
 * edges are chained into loops and oriented so their normal equals +n.
 */
export function clipSolid(faces: SolidFace[], plane: Plane): SolidFace[] {
  const { n, d } = plane;
  const kept: SolidFace[] = [];

  for (const face of faces) {
    const verts = face.polygon;
    const len = verts.length;

    // Classify each vertex
    const dist: number[] = new Array(len);
    const cls: number[] = new Array(len); // 1=OUT, -1=IN, 0=ON
    let hasIn = false;
    let hasOut = false;

    for (let i = 0; i < len; i++) {
      const v = verts[i];
      dist[i] = dot(n, v) - d;
      if (dist[i] > EPS) {
        cls[i] = 1; // OUT
        hasOut = true;
      } else if (dist[i] < -EPS) {
        cls[i] = -1; // IN
        hasIn = true;
      } else {
        cls[i] = 0; // ON
      }
    }

    // All vertices IN or ON → keep face unchanged
    if (!hasOut) {
      kept.push(face);
      continue;
    }

    // All vertices OUT or ON → remove face entirely
    if (!hasIn) {
      continue;
    }

    // Mixed face: clip it
    const out: Vec3[] = [];

    for (let i = 0; i < len; i++) {
      const j = (i + 1) % len;

      if (cls[i] !== 1) {
        // IN or ON → keep vertex
        out.push(verts[i]);
      }

      if ((cls[i] === -1 && cls[j] === 1) || (cls[i] === 1 && cls[j] === -1)) {
        // Edge crosses the plane
        const t = dist[i] / (dist[i] - dist[j]);
        const p: Vec3 = [
          verts[i][0] + t * (verts[j][0] - verts[i][0]),
          verts[i][1] + t * (verts[j][1] - verts[i][1]),
          verts[i][2] + t * (verts[j][2] - verts[i][2]),
        ];
        out.push(p);
      }
    }

    // Keep clipped face if it has enough area
    if (out.length >= 3) {
      const area = newell(out).area;
      if (area > 1e-8) {
        kept.push({ polygon: out, tags: face.tags });
      }
    }
  }

  // ── Build cap faces from boundary edges ────────────────────
  // In a closed solid, every directed edge A→B has a twin B→A in another face.
  // After clipping, boundary edges (edges with no twin) form the cap boundary.

  const directedEdges = new Map<string, number>(); // key → count

  for (const face of kept) {
    const poly = face.polygon;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const key = edgeKey(poly[i], poly[j]);
      directedEdges.set(key, (directedEdges.get(key) ?? 0) + 1);
    }
  }

  // Collect boundary edges: A→B where B→A doesn't exist
  const boundary: [Vec3, Vec3][] = [];
  for (const face of kept) {
    const poly = face.polygon;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const twinKey = edgeKey(poly[j], poly[i]);
      if (!directedEdges.has(twinKey)) {
        boundary.push([poly[i], poly[j]]);
      }
    }
  }

  // Chain boundary edges into loops and add as cap faces
  if (boundary.length > 0) {
    const loops = chainLoops(boundary);
    for (const loop of loops) {
      kept.push({
        polygon: orientLoop(loop, n),
        tags: { source: "cut" },
      });
    }
  }

  return kept;
}

// ── chainLoops ───────────────────────────────────────────────

/**
 * Greedy endpoint matching: chain segments into closed loops.
 * Segments may need flipping.
 */
export function chainLoops(segments: [Vec3, Vec3][]): Vec3[][] {
  const remaining = segments.map(([a, b]) => ({ a, b, used: false }));
  const loops: Vec3[][] = [];

  while (true) {
    // Find first unused segment
    const startIdx = remaining.findIndex((s) => !s.used);
    if (startIdx === -1) break;

    remaining[startIdx].used = true;
    const loop: Vec3[] = [remaining[startIdx].a, remaining[startIdx].b];

    // Grow the loop
    let maxIter = remaining.length + 1;
    while (maxIter-- > 0) {
      const tail = loop[loop.length - 1];
      const head = loop[0];

      // Check if loop is closed
      if (loop.length >= 3 && vec3Dist(tail, head) < EPS) {
        // Remove the duplicate closing point
        loop.pop();
        break;
      }

      // Find a segment that connects to the tail
      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        if (remaining[i].used) continue;

        if (vec3Dist(remaining[i].a, tail) < EPS) {
          remaining[i].used = true;
          loop.push(remaining[i].b);
          found = true;
          break;
        }

        if (vec3Dist(remaining[i].b, tail) < EPS) {
          remaining[i].used = true;
          loop.push(remaining[i].a);
          found = true;
          break;
        }
      }

      if (!found) {
        // Diagnostic dump
        const unusedSegs = remaining
          .filter((s) => !s.used)
          .map((s) => `[${fmtV(s.a)} → ${fmtV(s.b)}]`);
        throw new Error(
          `chainLoops: loop stalled at ${fmtV(tail)}, ` +
          `head=${fmtV(head)}, loop length=${loop.length}, ` +
          `unused segments: ${unusedSegs.join(", ")}`,
        );
      }
    }

    if (maxIter <= 0) {
      throw new Error("chainLoops: exceeded max iterations — loop did not close");
    }

    loops.push(loop);
  }

  // Assert every segment was consumed
  const unconsumed = remaining.filter((s) => !s.used);
  if (unconsumed.length > 0) {
    throw new Error(
      `chainLoops: ${unconsumed.length} segments not consumed: ` +
      unconsumed.map((s) => `[${fmtV(s.a)} → ${fmtV(s.b)}]`).join(", "),
    );
  }

  return loops;
}

// ── orientLoop ───────────────────────────────────────────────

/**
 * Orient a cap face loop so its outward normal equals +n.
 * The cap face is on the cut plane; the removed side is "outside".
 */
export function orientLoop(loop: Vec3[], n: Vec3): Vec3[] {
  const { normal } = newell(loop);
  if (dot(normal, n) < 0) {
    return [...loop].reverse();
  }
  return loop;
}

// ── Helpers ──────────────────────────────────────────────────

function vec3Dist(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function edgeKey(a: Vec3, b: Vec3): string {
  return `${snap6(a[0])},${snap6(a[1])},${snap6(a[2])},${snap6(b[0])},${snap6(b[1])},${snap6(b[2])}`;
}

function snap6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

function fmtV(v: Vec3): string {
  return `(${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)})`;
}
