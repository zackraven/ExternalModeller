import type { Face, FaceModel, JunctionRow, HalfEdge, Vec3 } from "../types.js";
import { cross, snap, dist3 } from "../geometry.js";

export function extractJunctions(model: FaceModel): JunctionRow[] {
  const totals = new Map<string, number>();
  const faceMap = new Map<string, Face>();
  for (const f of model.faces) faceMap.set(f.id, f);

  // Topology-based junctions (wall–wall corners, wall–floor)
  for (const he of model.edges) {
    if (!he.twin) continue;

    // Process each geometric edge once: only when from < to lexicographically
    if (vertexKey(he.from) >= vertexKey(he.to)) continue;

    const f1 = faceMap.get(he.face);
    const f2 = faceMap.get(he.twin);
    if (!f1 || !f2) continue;

    const jType = classifyJunction(he, f1, f2);
    if (jType) {
      totals.set(jType, (totals.get(jType) ?? 0) + dist3(he.from, he.to));
    }
  }

  // Opening-surround junctions (head, sill, jamb)
  for (const face of model.faces) {
    for (const opening of face.openings) {
      const verts = opening.vertices;
      const n = verts.length;

      // Z centroid to distinguish head from sill
      let zSum = 0;
      for (const v of verts) zSum += v[2];
      const zCenter = zSum / n;

      for (let i = 0; i < n; i++) {
        const from = verts[i];
        const to = verts[(i + 1) % n];
        const len = dist3(from, to);

        if (Math.abs(from[2] - to[2]) < 1e-4) {
          // Horizontal edge: head or sill
          const edgeZ = (from[2] + to[2]) / 2;
          const jType = edgeZ > zCenter ? "opening_head" : "opening_sill";
          totals.set(jType, (totals.get(jType) ?? 0) + len);
        } else {
          // Vertical/sloped edge: jamb
          totals.set("opening_jamb", (totals.get("opening_jamb") ?? 0) + len);
        }
      }
    }
  }

  return Array.from(totals.entries()).map(([type, length]) => ({
    type,
    length: round6(length),
  }));
}

function vertexKey(v: Vec3): string {
  return `${snap(v[0])},${snap(v[1])},${snap(v[2])}`;
}

function isVertical(he: HalfEdge): boolean {
  return (
    Math.abs(he.from[0] - he.to[0]) < 1e-4 &&
    Math.abs(he.from[1] - he.to[1]) < 1e-4 &&
    Math.abs(he.from[2] - he.to[2]) > 1e-4
  );
}

function isHorizontal(he: HalfEdge): boolean {
  return Math.abs(he.from[2] - he.to[2]) < 1e-4;
}

function classifyJunction(he: HalfEdge, f1: Face, f2: Face): string | null {
  // Wall–wall vertical edge → corner
  if (f1.tag.type === "wall" && f2.tag.type === "wall" && isVertical(he)) {
    // he goes from lower z to higher z (we ensured from < to).
    // The face owning the upward half-edge is the "incoming" wall.
    // he belongs to f1; its twin (reversed) belongs to f2.
    // Since from.z < to.z, he goes upward → f1 is incoming.
    const c = cross(f1.normal, f2.normal);
    return c[2] > 0 ? "external_corner" : "internal_corner";
  }

  // Wall–floor horizontal edge at z ≈ 0 → wall_ground_floor
  if (isHorizontal(he) && Math.abs(he.from[2]) < 1e-4) {
    const wall = f1.tag.type === "wall" ? f1 : f2.tag.type === "wall" ? f2 : null;
    const floor = f1.tag.type === "floor" ? f1 : f2.tag.type === "floor" ? f2 : null;
    if (wall && floor) {
      if (floor.tag.adjacency === "ground") return "wall_ground_floor";
      if (floor.tag.adjacency === "exposed") return "wall_exposed_floor";
    }
  }

  return null;
}

function round6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
