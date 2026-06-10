import type { Face, FaceModel, HalfEdge, Vec3 } from "../types.js";
import { snap } from "../geometry.js";

function vertexKey(v: Vec3): string {
  return `${snap(v[0])},${snap(v[1])},${snap(v[2])}`;
}

function edgeKey(from: Vec3, to: Vec3): string {
  return `${vertexKey(from)}->${vertexKey(to)}`;
}

export function buildTopology(faces: Face[]): FaceModel {
  const halfEdges: HalfEdge[] = [];
  const edgeMap = new Map<string, number>();

  for (const face of faces) {
    const n = face.vertices.length;
    for (let i = 0; i < n; i++) {
      const from = face.vertices[i];
      const to = face.vertices[(i + 1) % n];
      const key = edgeKey(from, to);
      const idx = halfEdges.length;
      halfEdges.push({ from, to, face: face.id });
      edgeMap.set(key, idx);
    }
  }

  // Match twins: half-edge A→B pairs with B→A
  for (let i = 0; i < halfEdges.length; i++) {
    const he = halfEdges[i];
    const twinKey = edgeKey(he.to, he.from);
    const twinIdx = edgeMap.get(twinKey);
    if (twinIdx !== undefined && twinIdx !== i) {
      he.twin = halfEdges[twinIdx].face;
    }
  }

  return { faces, edges: halfEdges };
}
