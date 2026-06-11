import type { Vec2, Vec3, CustomRoofFace } from "@sap-geometry/core";
import { suggestRoof } from "@sap-geometry/core";

// ── Types ─────────────────────────────────────────────

export interface RidgeNode {
  id: string;
  pos: Vec2;   // plan position (x, y)
  z: number;   // height above ground
}

export interface RidgeSegment {
  from: string; // node id
  to: string;   // node id
}

export interface RidgeGraph {
  nodes: RidgeNode[];
  segments: RidgeSegment[];
}

// ── Helpers ───────────────────────────────────────────

const EPS = 1e-6;

let _nodeCounter = 0;
export function generateNodeId(): string {
  return `rn_${++_nodeCounter}`;
}
export function resetNodeCounter(): void {
  _nodeCounter = 0;
}

function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Perpendicular projection of point p onto segment a→b. Returns [closest point, t parameter]. */
function projectOntoSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS * EPS) {
    return { point: a, t: 0 };
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return {
    point: [a[0] + t * dx, a[1] + t * dy],
    t,
  };
}

/** Interpolate z along a ridge segment at parameter t. */
function segmentZAt(graph: RidgeGraph, seg: RidgeSegment, t: number): number {
  const nFrom = graph.nodes.find(n => n.id === seg.from)!;
  const nTo = graph.nodes.find(n => n.id === seg.to)!;
  return nFrom.z + t * (nTo.z - nFrom.z);
}

/** Signed area of a 2D polygon (shoelace). Positive = CCW. */
function shoelace(poly: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  return area / 2;
}

/** Which side of directed line a→b does point p fall? >0 = left, <0 = right. */
function sideOf(p: Vec2, a: Vec2, b: Vec2): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

// ── Planarity helpers ─────────────────────────────────

const PLANARITY_TOL = 0.005; // half of core's 0.01m tolerance

/** Newell normal of a 3D polygon (un-normalized). */
function newellNormal(poly: Vec3[]): Vec3 {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const ci = poly[i], cj = poly[j];
    nx += (ci[1] - cj[1]) * (ci[2] + cj[2]);
    ny += (ci[2] - cj[2]) * (ci[0] + cj[0]);
    nz += (ci[0] - cj[0]) * (ci[1] + cj[1]);
  }
  return [nx, ny, nz];
}

/** Max distance of any vertex from the mean plane of a polygon. */
function maxPlanarityError(poly: Vec3[]): number {
  const n = newellNormal(poly);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < EPS) return 0;
  const nn: Vec3 = [n[0] / len, n[1] / len, n[2] / len];

  // Centroid
  let cx = 0, cy = 0, cz = 0;
  for (const v of poly) { cx += v[0]; cy += v[1]; cz += v[2]; }
  cx /= poly.length; cy /= poly.length; cz /= poly.length;

  let maxErr = 0;
  for (const v of poly) {
    const d = Math.abs(nn[0] * (v[0] - cx) + nn[1] * (v[1] - cy) + nn[2] * (v[2] - cz));
    if (d > maxErr) maxErr = d;
  }
  return maxErr;
}

/** Fan-triangulate a polygon into triangles from vertex 0. */
function fanTriangulate(poly: Vec3[]): Vec3[][] {
  const tris: Vec3[][] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    tris.push([poly[0], poly[i], poly[i + 1]]);
  }
  return tris;
}

// ── facesFromRidgeGraph ───────────────────────────────

/** Unclamped projection of point p onto line through a→b. */
function projectOntoLine(p: Vec2, a: Vec2, b: Vec2): { t: number } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < EPS * EPS) return { t: 0 };
  return { t: ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq };
}

/**
 * Derive CustomRoofFace[] from a ridge graph and footprint.
 *
 * Uses an edge-based approach: each footprint edge is classified by how its
 * midpoint relates to the nearest ridge segment:
 * - SLOPE: midpoint projects onto the segment interior → face keyed by (seg, side)
 * - HIP:   midpoint projects past a segment endpoint → face keyed by (seg, endpoint)
 * - GABLE: midpoint projects exactly at a segment endpoint → skip (handled by core)
 *
 * Consecutive edges with the same key are grouped into one face.
 */
export function facesFromRidgeGraph(
  graph: RidgeGraph,
  footprint: Vec2[],
  wallTopZ: number,
): CustomRoofFace[] {
  const n = footprint.length;
  if (n < 3 || graph.segments.length === 0) return [];

  // Pre-resolve segment endpoint positions
  const segEndpoints = graph.segments.map(seg => ({
    from: graph.nodes.find(nd => nd.id === seg.from)!,
    to: graph.nodes.find(nd => nd.id === seg.to)!,
  }));

  const T_EPS = 0.01; // tolerance for "at endpoint" vs "past endpoint"

  // Classify each footprint edge
  interface EdgeClass {
    kind: "slope" | "hip" | "gable";
    key: string;       // grouping key
    segIndex: number;
  }

  const edgeClasses: EdgeClass[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mid: Vec2 = [
      (footprint[i][0] + footprint[j][0]) / 2,
      (footprint[i][1] + footprint[j][1]) / 2,
    ];

    // Find nearest ridge segment
    let bestDist = Infinity;
    let bestSeg = 0;
    let bestT = 0;
    for (let si = 0; si < graph.segments.length; si++) {
      const ep = segEndpoints[si];
      const { point } = projectOntoSegment(mid, ep.from.pos, ep.to.pos);
      const d = dist2(mid, point);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = si;
        bestT = projectOntoLine(mid, ep.from.pos, ep.to.pos).t;
      }
    }

    const ep = segEndpoints[bestSeg];
    const seg = graph.segments[bestSeg];

    if (bestT > T_EPS && bestT < 1 - T_EPS) {
      // Interior → slope face, keyed by side
      const side = sideOf(mid, ep.from.pos, ep.to.pos) >= 0 ? 1 : -1;
      edgeClasses.push({ kind: "slope", key: `${bestSeg}:slope:${side}`, segIndex: bestSeg });
    } else if (bestT < -T_EPS) {
      // Past the "from" endpoint → hip face
      edgeClasses.push({ kind: "hip", key: `${bestSeg}:hip:${seg.from}`, segIndex: bestSeg });
    } else if (bestT > 1 + T_EPS) {
      // Past the "to" endpoint → hip face
      edgeClasses.push({ kind: "hip", key: `${bestSeg}:hip:${seg.to}`, segIndex: bestSeg });
    } else {
      // At endpoint → gable edge (core derives gable walls automatically)
      edgeClasses.push({ kind: "gable", key: `__gable_${i}`, segIndex: bestSeg });
    }
  }

  // Group consecutive edges with the same key
  interface EdgeGroup {
    edgeIndices: number[];
    key: string;
    kind: "slope" | "hip" | "gable";
  }

  const groups: EdgeGroup[] = [];
  let cur: EdgeGroup = { edgeIndices: [0], key: edgeClasses[0].key, kind: edgeClasses[0].kind };

  for (let i = 1; i < n; i++) {
    if (edgeClasses[i].key === cur.key) {
      cur.edgeIndices.push(i);
    } else {
      groups.push(cur);
      cur = { edgeIndices: [i], key: edgeClasses[i].key, kind: edgeClasses[i].kind };
    }
  }
  // Close: check if first and last groups share the same key
  if (groups.length > 0 && cur.key === groups[0].key) {
    groups[0].edgeIndices = [...cur.edgeIndices, ...groups[0].edgeIndices];
    groups[0].kind = groups[0].kind === "gable" ? cur.kind : groups[0].kind;
  } else {
    groups.push(cur);
  }

  // Build face polygons from each group
  const faces: CustomRoofFace[] = [];

  for (const group of groups) {
    const edges = group.edgeIndices;
    if (edges.length === 0) continue;

    // Collect vertex indices: first vertex of each edge + last vertex of last edge
    const vertexIndices: number[] = [];
    for (const ei of edges) {
      vertexIndices.push(ei);
    }
    vertexIndices.push((edges[edges.length - 1] + 1) % n);

    // Footprint side at wallTopZ
    const footprintSide: Vec3[] = vertexIndices.map(i => [
      footprint[i][0], footprint[i][1], wallTopZ,
    ] as Vec3);

    // Ridge side: project each footprint vertex onto nearest ridge segment
    // and collect unique ridge points (in reverse for proper winding)
    const ridgePoints: Vec3[] = [];
    const seen = new Set<string>();

    for (let k = vertexIndices.length - 1; k >= 0; k--) {
      const vi = vertexIndices[k];
      const v = footprint[vi];

      // Project onto the group's ridge segment
      let bestDist = Infinity;
      let bestPoint: Vec2 = [0, 0];
      let bestZ = wallTopZ;
      for (let si = 0; si < graph.segments.length; si++) {
        const ep = segEndpoints[si];
        const { point, t } = projectOntoSegment(v, ep.from.pos, ep.to.pos);
        const d = dist2(v, point);
        if (d < bestDist) {
          bestDist = d;
          bestPoint = point;
          bestZ = segmentZAt(graph, graph.segments[si], t);
        }
      }

      const rkey = `${bestPoint[0].toFixed(6)},${bestPoint[1].toFixed(6)}`;
      if (!seen.has(rkey)) {
        seen.add(rkey);
        ridgePoints.push([bestPoint[0], bestPoint[1], bestZ]);
      }
    }

    if (ridgePoints.length === 0) continue;

    const polygon: Vec3[] = [...footprintSide, ...ridgePoints];
    if (polygon.length < 3) continue;

    // Check non-zero plan area
    const planPoly: Vec2[] = polygon.map(v => [v[0], v[1]] as Vec2);
    if (Math.abs(shoelace(planPoly)) < EPS) continue;

    faces.push({ polygon });
  }

  // Ensure all faces are planar — triangulate any that aren't
  const result: CustomRoofFace[] = [];
  for (const face of faces) {
    if (face.polygon.length <= 3 || maxPlanarityError(face.polygon) < PLANARITY_TOL) {
      result.push(face);
    } else {
      // Fan-triangulate non-planar faces
      for (const tri of fanTriangulate(face.polygon)) {
        const planArea: Vec2[] = tri.map(v => [v[0], v[1]] as Vec2);
        if (Math.abs(shoelace(planArea)) > EPS) {
          result.push({ polygon: tri });
        }
      }
    }
  }

  return result;
}

// ── roofPlanLines ─────────────────────────────────────

/**
 * Compute hip/valley projection lines from footprint vertices to their
 * nearest point on the ridge graph.  These lines represent the hip ridges,
 * valley creases, and gable edges of the roof in plan view.
 */
export function roofPlanLines(
  graph: RidgeGraph,
  footprint: Vec2[],
): { from: Vec2; to: Vec2 }[] {
  if (graph.segments.length === 0 || footprint.length < 3) return [];

  const segEndpoints = graph.segments.map(seg => ({
    from: graph.nodes.find(nd => nd.id === seg.from)!,
    to: graph.nodes.find(nd => nd.id === seg.to)!,
  }));

  const lines: { from: Vec2; to: Vec2 }[] = [];

  for (const v of footprint) {
    let bestDist = Infinity;
    let bestPoint: Vec2 = [0, 0];
    for (const ep of segEndpoints) {
      const { point } = projectOntoSegment(v, ep.from.pos, ep.to.pos);
      const d = dist2(v, point);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = point;
      }
    }
    // Skip if vertex is essentially on the ridge
    if (bestDist < 0.05) continue;
    lines.push({ from: v, to: bestPoint });
  }
  return lines;
}

// ── ridgeGraphFromParametric ──────────────────────────

/**
 * Create initial ridge graph from parametric roof parameters.
 *
 * Calls suggestRoof() to generate faces, then reverse-engineers the
 * ridge graph by finding the highest vertices (ridge nodes) and the
 * edges connecting them.
 */
export function ridgeGraphFromParametric(
  footprint: Vec2[],
  roofType: "flat" | "mono" | "dual" | "hip",
  pitch: number,
  ridgeEdge: number,
  wallTopZ: number,
): RidgeGraph {
  if (roofType === "flat") {
    return { nodes: [], segments: [] };
  }

  const faces = suggestRoof(
    footprint,
    { type: roofType, pitch, ridgeEdge },
    wallTopZ,
  );

  if (faces.length === 0) {
    return { nodes: [], segments: [] };
  }

  // Find all vertices that are above wallTopZ — these are ridge vertices
  const ridgeVertices: Vec3[] = [];
  const ridgeVertexKeys = new Set<string>();

  for (const face of faces) {
    for (const v of face.polygon) {
      if (v[2] > wallTopZ + EPS) {
        const key = `${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`;
        if (!ridgeVertexKeys.has(key)) {
          ridgeVertexKeys.add(key);
          ridgeVertices.push(v);
        }
      }
    }
  }

  if (ridgeVertices.length === 0) {
    return { nodes: [], segments: [] };
  }

  // Create ridge nodes
  const nodes: RidgeNode[] = ridgeVertices.map((v, i) => ({
    id: generateNodeId(),
    pos: [v[0], v[1]] as Vec2,
    z: v[2],
  }));

  // Find ridge edges: edges connecting two ridge vertices that appear on the same face
  const segments: RidgeSegment[] = [];
  const segmentKeys = new Set<string>();

  function findNodeForVertex(v: Vec3): RidgeNode | undefined {
    return nodes.find(
      n => Math.abs(n.pos[0] - v[0]) < 0.001 &&
           Math.abs(n.pos[1] - v[1]) < 0.001 &&
           Math.abs(n.z - v[2]) < 0.001,
    );
  }

  for (const face of faces) {
    const poly = face.polygon;
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const nA = findNodeForVertex(poly[i]);
      const nB = findNodeForVertex(poly[j]);
      if (nA && nB && nA.id !== nB.id) {
        const key = [nA.id, nB.id].sort().join(",");
        if (!segmentKeys.has(key)) {
          segmentKeys.add(key);
          segments.push({ from: nA.id, to: nB.id });
        }
      }
    }
  }

  // If we have ridge nodes but no connecting segments (e.g. mono pitch with
  // one ridge line — all ridge vertices are co-linear), connect them in order
  if (segments.length === 0 && nodes.length >= 2) {
    // Sort by position to get a consistent ordering
    const sorted = [...nodes].sort((a, b) => {
      const dx = a.pos[0] - b.pos[0];
      return Math.abs(dx) > EPS ? dx : a.pos[1] - b.pos[1];
    });
    for (let i = 0; i < sorted.length - 1; i++) {
      segments.push({ from: sorted[i].id, to: sorted[i + 1].id });
    }
  }

  return { nodes, segments };
}
