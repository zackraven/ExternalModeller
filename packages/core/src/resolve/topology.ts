import type { Face, FaceModel, HalfEdge, Vec3 } from "../types.js";
import { snap } from "../geometry.js";

function vertexKey(v: Vec3): string {
  return `${snap(v[0])},${snap(v[1])},${snap(v[2])}`;
}

function edgeKey(from: Vec3, to: Vec3): string {
  return `${vertexKey(from)}->${vertexKey(to)}`;
}

/** Extract mass id from a face id (the prefix before the first underscore-delimited type). */
function massOfFace(faceId: string): string {
  // Face IDs: `${massId}_wall_...`, `${massId}_floor`, `${massId}_roof_...`
  // massId itself may contain underscores (e.g. "mass_0"), so we look for known type suffixes.
  for (const sep of ["_wall_", "_floor", "_roof_", "_gable_", "_dormer_"]) {
    const idx = faceId.indexOf(sep);
    if (idx !== -1) return faceId.slice(0, idx);
  }
  return faceId;
}

export function buildTopology(faces: Face[]): FaceModel {
  const halfEdges: HalfEdge[] = [];
  const edgeMap = new Map<string, number[]>();

  for (const face of faces) {
    const n = face.vertices.length;
    for (let i = 0; i < n; i++) {
      const from = face.vertices[i];
      const to = face.vertices[(i + 1) % n];
      const key = edgeKey(from, to);
      const idx = halfEdges.length;
      halfEdges.push({ from, to, face: face.id });
      let arr = edgeMap.get(key);
      if (!arr) {
        arr = [];
        edgeMap.set(key, arr);
      }
      arr.push(idx);
    }
  }

  // Match twins: half-edge A→B pairs with B→A
  // Prefer same-mass twins for correct floor-wall/wall-roof pairing within a mass
  for (let i = 0; i < halfEdges.length; i++) {
    if (halfEdges[i].twin !== undefined) continue;
    const he = halfEdges[i];
    const twinKey = edgeKey(he.to, he.from);
    const candidates = edgeMap.get(twinKey);
    if (!candidates) continue;

    const heMass = massOfFace(he.face);

    // Find the best twin: prefer same-mass, then any unmatched
    let bestIdx: number | undefined;
    for (const ci of candidates) {
      if (ci === i) continue;
      if (halfEdges[ci].twin !== undefined) continue;
      const candidateMass = massOfFace(halfEdges[ci].face);
      if (candidateMass === heMass) {
        bestIdx = ci;
        break; // same-mass is best, stop looking
      }
      if (bestIdx === undefined) {
        bestIdx = ci;
      }
    }

    if (bestIdx !== undefined) {
      he.twin = halfEdges[bestIdx].face;
      halfEdges[bestIdx].twin = he.face;
    }
  }

  return { faces, edges: halfEdges };
}
