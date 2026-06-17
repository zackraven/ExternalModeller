import polygonClipping from "polygon-clipping";
import type { Face, Vec3 } from "@sap-geometry/core";

const SNAP = 1e-4;

function snapVal(x: number): string {
  return (Math.round(x / SNAP) * SNAP).toFixed(4);
}

/**
 * Plane key for a face: snapped normal + signed distance.
 * Uses the actual normal direction (not canonicalised) so that
 * opposite-facing faces on the same geometric plane get different keys.
 */
export function planeKey(face: Face): string {
  const n = face.normal;
  const v = face.vertices[0];
  const d = n[0] * v[0] + n[1] * v[1] + n[2] * v[2];
  return `${snapVal(n[0])},${snapVal(n[1])},${snapVal(n[2])}|${snapVal(d)}`;
}

/**
 * Build 2D/3D projection helpers for a plane defined by a normal.
 * Drops the axis most aligned with the normal.
 */
export function makeProjection(normal: Vec3, sampleVertex: Vec3) {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);

  let dropAxis: 0 | 1 | 2;
  if (az >= ax && az >= ay) dropAxis = 2;
  else if (ay >= ax) dropAxis = 1;
  else dropAxis = 0;

  const fixedVal = sampleVertex[dropAxis];

  const to2D = (v: Vec3): [number, number] => {
    if (dropAxis === 2) return [v[0], v[1]];
    if (dropAxis === 1) return [v[0], v[2]];
    return [v[1], v[2]];
  };

  const to3D = (p: [number, number]): Vec3 => {
    if (dropAxis === 2) return [p[0], p[1], fixedVal];
    if (dropAxis === 1) return [p[0], fixedVal, p[1]];
    return [fixedVal, p[0], p[1]];
  };

  return { to2D, to3D };
}

export interface MergedGroupInfo {
  unionArea: number;
  faceCount: number;
  openingArea: number;
}

/**
 * For a given face ID, find all coplanar faces from different masses on the
 * same plane and compute the polygon union area.
 *
 * Returns null if the face is solo (no cross-mass coplanar partners).
 */
export function computeMergedGroupInfo(
  faces: Face[],
  faceId: string,
): MergedGroupInfo | null {
  const selected = faces.find((f) => f.id === faceId);
  if (!selected) return null;

  const pk = planeKey(selected);

  // Find all faces on the same plane
  const coplanar = faces.filter((f) => {
    if (f.tag.adjacency === "party") return false;
    if (f.occludedArea && f.occludedArea >= f.area * 0.99) return false;
    return planeKey(f) === pk;
  });

  // Check if faces span multiple masses
  const masses = new Set(coplanar.map((f) => f.tag.mass));
  if (masses.size <= 1) return null;

  // Project all faces to 2D and compute polygon union area
  const { to2D } = makeProjection(selected.normal, selected.vertices[0]);

  const polys: polygonClipping.Polygon[] = coplanar.map((face) => [
    face.vertices.map((v) => to2D(v)),
  ]);

  let unionResult: polygonClipping.MultiPolygon;
  try {
    unionResult = polygonClipping.union(polys[0], ...polys.slice(1));
  } catch {
    return null;
  }

  if (unionResult.length === 0) return null;

  // Compute union area via shoelace
  let unionArea = 0;
  for (const polygon of unionResult) {
    for (let ri = 0; ri < polygon.length; ri++) {
      const ring = polygon[ri];
      let ringArea = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        ringArea += ring[i][0] * ring[j][1];
        ringArea -= ring[j][0] * ring[i][1];
      }
      ringArea = Math.abs(ringArea) / 2;
      // First ring is outer (add), subsequent are holes (subtract)
      unionArea += ri === 0 ? ringArea : -ringArea;
    }
  }

  // Sum all openings across all faces in the group
  let openingArea = 0;
  for (const face of coplanar) {
    for (const o of face.openings) {
      openingArea += o.area;
    }
  }

  return { unionArea, faceCount: coplanar.length, openingArea };
}

/** Point-in-polygon via ray casting. */
function pointInPolygon2D(
  point: [number, number],
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Extract per-mass footprint and maxZ from face array. */
function extractMassInfo(
  faces: Face[],
): Map<string, { footprint: [number, number][]; maxZ: number }> {
  const info = new Map<string, { footprint: [number, number][]; maxZ: number }>();
  for (const f of faces) {
    const mid = f.tag.mass;
    let entry = info.get(mid);
    if (!entry) {
      entry = { footprint: [], maxZ: 0 };
      info.set(mid, entry);
    }
    if (f.tag.type === "floor") {
      entry.footprint = f.vertices.map((v) => [v[0], v[1]] as [number, number]);
    }
    for (const v of f.vertices) {
      if (v[2] > entry.maxZ) entry.maxZ = v[2];
    }
  }
  return info;
}

/** Shoelace area of a 2D multi-polygon result. */
function multiPolyArea(mp: polygonClipping.MultiPolygon): number {
  let area = 0;
  for (const polygon of mp) {
    for (let ri = 0; ri < polygon.length; ri++) {
      const ring = polygon[ri];
      let ringArea = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        ringArea += ring[i][0] * ring[j][1];
        ringArea -= ring[j][0] * ring[i][1];
      }
      ringArea = Math.abs(ringArea) / 2;
      area += ri === 0 ? ringArea : -ringArea;
    }
  }
  return area;
}

/**
 * Find segments of the line `nx*x + ny*y = d` that lie inside the polygon.
 * Returns pairs of XY points, each pair defining an inside-segment.
 */
function linePolygonSegments(
  footprint: [number, number][],
  nx: number,
  ny: number,
  d: number,
): [[number, number], [number, number]][] {
  const EPS = 1e-6;

  // Signed distance of each vertex to the line
  const dists = footprint.map((v) => nx * v[0] + ny * v[1] - d);

  // Collect crossing / on-line points
  const crossings: { point: [number, number]; param: number }[] = [];
  for (let i = 0; i < footprint.length; i++) {
    const j = (i + 1) % footprint.length;
    if (Math.abs(dists[i]) <= EPS) {
      const p = footprint[i];
      crossings.push({ point: [p[0], p[1]], param: -ny * p[0] + nx * p[1] });
    }
    if (
      (dists[i] > EPS && dists[j] < -EPS) ||
      (dists[i] < -EPS && dists[j] > EPS)
    ) {
      const t = dists[i] / (dists[i] - dists[j]);
      const x = footprint[i][0] + t * (footprint[j][0] - footprint[i][0]);
      const y = footprint[i][1] + t * (footprint[j][1] - footprint[i][1]);
      crossings.push({ point: [x, y], param: -ny * x + nx * y });
    }
  }
  if (crossings.length < 2) return [];

  crossings.sort((a, b) => a.param - b.param);

  // Deduplicate very close crossings (vertex-on-line duplicates)
  const deduped = [crossings[0]];
  for (let i = 1; i < crossings.length; i++) {
    if (crossings[i].param - deduped[deduped.length - 1].param > EPS * 10) {
      deduped.push(crossings[i]);
    }
  }
  if (deduped.length < 2) return [];

  // Pair segments whose midpoint is inside the polygon
  const segments: [[number, number], [number, number]][] = [];
  for (let i = 0; i + 1 < deduped.length; i++) {
    const mid: [number, number] = [
      (deduped[i].point[0] + deduped[i + 1].point[0]) / 2,
      (deduped[i].point[1] + deduped[i + 1].point[1]) / 2,
    ];
    if (pointInPolygon2D(mid, footprint)) {
      segments.push([deduped[i].point, deduped[i + 1].point]);
    }
  }
  return segments;
}

/**
 * Build 2D shadow rectangles representing where another mass's volume
 * intersects a vertical wall plane.  Each shadow is the wall-plane
 * cross-section of the mass's extruded footprint (from z=0 to maxZ),
 * projected to the wall's 2D coordinate system.
 */
function wallShadowPolygons(
  wallNormal: Vec3,
  wallVertex: Vec3,
  footprint: [number, number][],
  maxZ: number,
  to2D: (v: Vec3) => [number, number],
): polygonClipping.Polygon[] {
  const nx = wallNormal[0], ny = wallNormal[1];
  const d = nx * wallVertex[0] + ny * wallVertex[1];

  // The other mass must extend past the wall into the exterior (normal)
  // direction.  If all footprint vertices are on the interior side or
  // exactly on the wall plane, nothing occludes.
  const hasExterior = footprint.some(
    (v) => nx * v[0] + ny * v[1] - d > 0.01,
  );
  if (!hasExterior) return [];

  const segments = linePolygonSegments(footprint, nx, ny, d);
  if (segments.length === 0) return [];

  const polygons: polygonClipping.Polygon[] = [];
  for (const [p1, p2] of segments) {
    // 3D points on the wall plane at z=0 and z=maxZ
    const rect2D: [number, number][] = [
      to2D([p1[0], p1[1], 0]),
      to2D([p2[0], p2[1], 0]),
      to2D([p2[0], p2[1], maxZ]),
      to2D([p1[0], p1[1], maxZ]),
    ];
    polygons.push([rect2D]);
  }
  return polygons;
}

/**
 * Compute the area of shadow polygons that overlaps a face polygon.
 * Handles union of multiple shadows to avoid double-counting.
 */
function intersectFaceWithShadows(
  facePoly2D: [number, number][],
  shadows: polygonClipping.Polygon[],
): number {
  if (shadows.length === 0) return 0;

  // Union all shadow polygons first (avoid double-counting overlaps)
  let shadowUnion: polygonClipping.MultiPolygon;
  try {
    if (shadows.length === 1) {
      shadowUnion = [shadows[0]];
    } else {
      shadowUnion = polygonClipping.union(shadows[0], ...shadows.slice(1));
    }
  } catch {
    return 0;
  }

  // Intersect face with each disjoint piece of the union
  const facePolygon: polygonClipping.Polygon = [facePoly2D];
  let occluded = 0;
  for (const sp of shadowUnion) {
    try {
      const intersection = polygonClipping.intersection(
        facePolygon,
        sp as polygonClipping.Polygon,
      );
      occluded += multiPolyArea(intersection);
    } catch {
      // skip
    }
  }
  return occluded;
}

/**
 * Compute the area of a face that is hidden by another mass's volume.
 *
 * Handles two cases:
 *  - **Walls / gables**: projects the wall to 2D, computes the cross-section
 *    of each other mass's volume on the wall plane, and uses polygon-clipping
 *    to find the overlap (handles both full and partial width overlap).
 *  - **Flat faces** (roofs / ceilings): the portion whose XY footprint
 *    lies inside a taller mass is occluded.
 *
 * Returns 0 when no cross-mass overlap exists.
 */
export function computeCrossMassOcclusion(
  faces: Face[],
  faceId: string,
): number {
  const face = faces.find((f) => f.id === faceId);
  if (!face) return 0;

  const massInfo = extractMassInfo(faces);

  // ── Wall / gable occlusion ───────────────────────────────
  if (face.tag.type === "wall") {
    const { to2D } = makeProjection(face.normal, face.vertices[0]);
    const facePoly2D: [number, number][] = face.vertices.map((v) => to2D(v));

    // Collect shadow polygons from all other masses
    const shadows: polygonClipping.Polygon[] = [];
    for (const [massId, mi] of massInfo) {
      if (massId === face.tag.mass) continue;
      if (mi.footprint.length < 3) continue;
      shadows.push(
        ...wallShadowPolygons(
          face.normal,
          face.vertices[0],
          mi.footprint,
          mi.maxZ,
          to2D,
        ),
      );
    }

    return Math.min(intersectFaceWithShadows(facePoly2D, shadows), face.area);
  }

  // ── Flat face occlusion (roof / ceiling) ────────────────
  const zs = face.vertices.map((v) => v[2]);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  if (zMax - zMin > 0.1) return 0; // not flat — skip

  const faceZ = (zMin + zMax) / 2;

  const clips: polygonClipping.Polygon[] = [];
  for (const [massId, mi] of massInfo) {
    if (massId === face.tag.mass) continue;
    if (mi.footprint.length < 3) continue;
    if (mi.maxZ <= faceZ + 0.02) continue;
    clips.push([mi.footprint]);
  }
  if (clips.length === 0) return 0;

  return intersectFaceWithShadows(
    face.vertices.map((v) => [v[0], v[1]] as [number, number]),
    clips,
  );
}
