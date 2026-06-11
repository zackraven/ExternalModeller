import type { Mass, Face, Vec2, Vec3 } from "../types.js";
import { newell, ensureCCW, snapVec3 } from "../geometry.js";

const SNAP = 1e-4;

export function buildRoof(mass: Mass, massId: string): Face[] {
  const roof = mass.roof;
  if (!roof || roof.type === "none") return [];

  const footprint = ensureCCW(mass.footprint);
  const wallTopZ =
    mass.storeys.reduce((sum, s) => sum + s.height, 0);
  const lastStorey = mass.storeys.length - 1;

  switch (roof.type) {
    case "flat":
      return buildFlatRoof(footprint, wallTopZ, massId, lastStorey);
    case "mono":
      return buildMonoRoof(footprint, wallTopZ, massId, lastStorey, roof.pitch ?? 30, roof.ridgeEdge);
    case "dual":
      return buildDualRoof(footprint, wallTopZ, massId, lastStorey, roof.pitch ?? 35, roof.ridgeEdge);
    case "hip":
      return buildHipRoof(footprint, wallTopZ, massId, lastStorey, roof.pitch ?? 35, roof.ridgeEdge);
    default:
      return [];
  }
}

// -- Flat --------------------------------------------------------

function buildFlatRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
): Face[] {
  // CCW winding at wallTopZ -> normal +Z
  const vertices: Vec3[] = footprint.map(([x, y]) => snapVec3([x, y, wallTopZ]));
  const { area, normal } = newell(vertices);
  return [{
    id: `${massId}_roof_p0`,
    vertices,
    normal,
    area,
    tag: { mass: massId, storey: lastStorey, type: "roof", adjacency: "external" },
    openings: [],
  }];
}

// -- Helpers for pitched roofs -----------------------------------

/** Find the index of the longest footprint edge, used as default ridgeEdge. */
function longestEdge(footprint: Vec2[]): number {
  let best = 0;
  let bestLen = 0;
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i];
    const b = footprint[(i + 1) % footprint.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > bestLen) {
      bestLen = len;
      best = i;
    }
  }
  return best;
}

/**
 * For any N-vertex polygon, compute ridge geometry relative to a given eaves edge.
 * Replaces rectRoofGeometry which only worked for 4-vertex rectangles.
 *
 * Returns perpendicular distances of ALL vertices from the eaves edge,
 * enabling correct pitched roofs on arbitrary polygon footprints.
 */
function pitchedRoofGeometry(footprint: Vec2[], ridgeEdge: number) {
  const n = footprint.length;
  const eA = footprint[ridgeEdge];
  const eB = footprint[(ridgeEdge + 1) % n];

  // Edge direction (along eaves)
  const edx = eB[0] - eA[0];
  const edy = eB[1] - eA[1];
  const edgeLen = Math.sqrt(edx * edx + edy * edy);

  // Unit vector along eaves edge
  const ux = edx / edgeLen;
  const uy = edy / edgeLen;

  // Inward perpendicular unit vector (for CCW winding)
  const px = -edy / edgeLen;
  const py = edx / edgeLen;

  // Perpendicular distance of each vertex from the eaves edge
  const perpDists: number[] = [];
  for (let i = 0; i < n; i++) {
    const dx = footprint[i][0] - eA[0];
    const dy = footprint[i][1] - eA[1];
    perpDists.push(dx * px + dy * py);
  }

  const span = Math.max(...perpDists);
  const halfSpan = span / 2;

  return { eA, eB, ux, uy, px, py, edgeLen, span, halfSpan, perpDists };
}

function makeFace(
  id: string, vertices: Vec3[], massId: string, storey: number,
  type: "roof" | "wall", adjacency: Face["tag"]["adjacency"], edge?: number,
): Face {
  const { area, normal } = newell(vertices);
  return {
    id,
    vertices,
    normal,
    area,
    tag: { mass: massId, storey, type, adjacency, edge },
    openings: [],
  };
}

/**
 * Remove collinear vertices from a polygon.
 * This cleans up degenerate zero-width "slits" that occur when the ridge
 * passes through footprint vertices, which would otherwise break earcut
 * triangulation in the viewer.
 */
function removeCollinear(pts: Vec2[], dists: number[]): { pts: Vec2[]; dists: number[] } {
  if (pts.length < 4) return { pts, dists };

  const result: Vec2[] = [];
  const resultDists: number[] = [];
  const n = pts.length;

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    // 2D cross product of (curr-prev) x (next-curr)
    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];
    const cross = dx1 * dy2 - dy1 * dx2;

    if (Math.abs(cross) > SNAP) {
      result.push(curr);
      resultDists.push(dists[i]);
    }
  }

  // Need at least 3 vertices for a valid polygon
  if (result.length < 3) return { pts, dists };
  return { pts: result, dists: resultDists };
}

// -- Mono --------------------------------------------------------

function buildMonoRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
  pitch: number, ridgeEdgeParam?: number,
): Face[] {
  const ridgeEdge = ridgeEdgeParam ?? longestEdge(footprint);
  const g = pitchedRoofGeometry(footprint, ridgeEdge);
  const n = footprint.length;

  const tanP = Math.tan((pitch * Math.PI) / 180);

  // Roof Z for each vertex: height increases with perpendicular distance
  const roofZ = g.perpDists.map(d => wallTopZ + d * tanP);

  // Roof face: all footprint vertices at their computed Z
  const roofVerts: Vec3[] = footprint.map(([x, y], i) =>
    snapVec3([x, y, roofZ[i]]),
  );
  const faces: Face[] = [
    makeFace(`${massId}_roof_p0`, roofVerts, massId, lastStorey, "roof", "external"),
  ];

  // Gable walls: for each footprint edge where Z differs from wallTopZ
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const zA = roofZ[i];
    const zB = roofZ[j];
    const [ax, ay] = footprint[i];
    const [bx, by] = footprint[j];

    const aAtWall = Math.abs(zA - wallTopZ) < SNAP;
    const bAtWall = Math.abs(zB - wallTopZ) < SNAP;

    // Skip eaves edges (both at wallTopZ)
    if (aAtWall && bAtWall) continue;

    let gableVerts: Vec3[];
    if (aAtWall) {
      // Triangle: A at wallTopZ, B rises
      gableVerts = [
        snapVec3([ax, ay, wallTopZ]),
        snapVec3([bx, by, wallTopZ]),
        snapVec3([bx, by, zB]),
      ];
    } else if (bAtWall) {
      // Triangle: B at wallTopZ, A rises
      gableVerts = [
        snapVec3([ax, ay, wallTopZ]),
        snapVec3([bx, by, wallTopZ]),
        snapVec3([ax, ay, zA]),
      ];
    } else {
      // Both above wallTopZ: rectangle or trapezoid
      gableVerts = [
        snapVec3([ax, ay, wallTopZ]),
        snapVec3([bx, by, wallTopZ]),
        snapVec3([bx, by, zB]),
        snapVec3([ax, ay, zA]),
      ];
    }

    faces.push(makeFace(
      `${massId}_gable_e${i}`, gableVerts, massId, lastStorey, "wall", "external", i,
    ));
  }

  return faces;
}

// -- Dual --------------------------------------------------------

/**
 * Split the footprint polygon along the ridge line (at perpDist = halfSpan).
 * Returns two sub-polygons with their perpendicular distances.
 * Collinear vertices are removed to prevent degenerate zero-width slits
 * that break earcut triangulation.
 */
function splitFootprintAtRidge(
  footprint: Vec2[],
  perpDists: number[],
  halfSpan: number,
): { side0: Vec2[]; side0Dists: number[]; side1: Vec2[]; side1Dists: number[] } {
  const n = footprint.length;
  let side0: Vec2[] = [];
  let side0Dists: number[] = [];
  let side1: Vec2[] = [];
  let side1Dists: number[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dI = perpDists[i];
    const dJ = perpDists[j];
    const vI = footprint[i];
    const vJ = footprint[j];

    const below = dI < halfSpan - SNAP;
    const above = dI > halfSpan + SNAP;
    const onRidge = !below && !above;

    // Add vertex to appropriate side(s)
    if (below || onRidge) {
      side0.push(vI);
      side0Dists.push(dI);
    }
    if (above || onRidge) {
      side1.push(vI);
      side1Dists.push(dI);
    }

    // If edge strictly crosses the ridge, insert the crossing point
    const jBelow = dJ < halfSpan - SNAP;
    const jAbove = dJ > halfSpan + SNAP;
    if ((below && jAbove) || (above && jBelow)) {
      const t = (halfSpan - dI) / (dJ - dI);
      const crossPt: Vec2 = [
        vI[0] + t * (vJ[0] - vI[0]),
        vI[1] + t * (vJ[1] - vI[1]),
      ];
      side0.push(crossPt);
      side0Dists.push(halfSpan);
      side1.push(crossPt);
      side1Dists.push(halfSpan);
    }
  }

  // Remove collinear vertices to eliminate degenerate zero-width slits
  // (e.g., when the ridge passes through footprint vertices in L/T/U shapes)
  const clean0 = removeCollinear(side0, side0Dists);
  const clean1 = removeCollinear(side1, side1Dists);

  return {
    side0: clean0.pts, side0Dists: clean0.dists,
    side1: clean1.pts, side1Dists: clean1.dists,
  };
}

function buildDualRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
  pitch: number, ridgeEdgeParam?: number,
): Face[] {
  const ridgeEdge = ridgeEdgeParam ?? longestEdge(footprint);
  const g = pitchedRoofGeometry(footprint, ridgeEdge);
  const n = footprint.length;

  const tanP = Math.tan((pitch * Math.PI) / 180);
  const ridgeZ = wallTopZ + g.halfSpan * tanP;

  // Split footprint along the ridge line
  const { side0, side0Dists, side1, side1Dists } = splitFootprintAtRidge(
    footprint, g.perpDists, g.halfSpan,
  );

  const faces: Face[] = [];

  // Roof plane 0 (eaves side): Z increases with perpDist
  if (side0.length >= 3) {
    const verts0: Vec3[] = side0.map(([x, y], i) =>
      snapVec3([x, y, wallTopZ + side0Dists[i] * tanP]),
    );
    faces.push(makeFace(`${massId}_roof_p0`, verts0, massId, lastStorey, "roof", "external"));
  }

  // Roof plane 1 (opposite side): Z increases with (span - perpDist)
  if (side1.length >= 3) {
    const verts1: Vec3[] = side1.map(([x, y], i) =>
      snapVec3([x, y, wallTopZ + (g.span - side1Dists[i]) * tanP]),
    );
    faces.push(makeFace(`${massId}_roof_p1`, verts1, massId, lastStorey, "roof", "external"));
  }

  // Gable walls on original footprint edges
  // Roof Z at each original vertex: dual formula
  const roofZ = g.perpDists.map(d =>
    wallTopZ + Math.min(d, g.span - d) * tanP,
  );

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dA = g.perpDists[i];
    const dB = g.perpDists[j];
    const zA = roofZ[i];
    const zB = roofZ[j];
    const [ax, ay] = footprint[i];
    const [bx, by] = footprint[j];

    const aAtWall = Math.abs(zA - wallTopZ) < SNAP;
    const bAtWall = Math.abs(zB - wallTopZ) < SNAP;

    // Check if ridge crosses this edge (endpoints strictly on opposite sides)
    const aBelow = dA < g.halfSpan - SNAP;
    const bBelow = dB < g.halfSpan - SNAP;
    const aAbove = dA > g.halfSpan + SNAP;
    const bAbove = dB > g.halfSpan + SNAP;
    const ridgeCrosses = (aBelow && bAbove) || (aAbove && bBelow);

    // Build the gable wall as [A_wtz, B_wtz, ...top profile from B back to A]
    // The top profile follows the roof: B_roofZ -> ridgeCrossing_ridgeZ -> A_roofZ
    // Vertices at wallTopZ are omitted from the top profile (they coincide with bottom)
    const topProfile: Vec3[] = [];
    if (!bAtWall) topProfile.push(snapVec3([bx, by, zB]));
    if (ridgeCrosses) {
      const t = (g.halfSpan - dA) / (dB - dA);
      const cx = ax + t * (bx - ax);
      const cy = ay + t * (by - ay);
      topProfile.push(snapVec3([cx, cy, ridgeZ]));
    }
    if (!aAtWall) topProfile.push(snapVec3([ax, ay, zA]));

    if (topProfile.length === 0) continue; // No gable (both at wallTopZ, no ridge crossing)

    const gableVerts: Vec3[] = [
      snapVec3([ax, ay, wallTopZ]),
      snapVec3([bx, by, wallTopZ]),
      ...topProfile,
    ];

    faces.push(makeFace(
      `${massId}_gable_e${i}`, gableVerts, massId, lastStorey, "wall", "external", i,
    ));
  }

  return faces;
}

// -- Hip ---------------------------------------------------------

function buildHipRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
  pitch: number, ridgeEdgeParam?: number,
): Face[] {
  const n = footprint.length;

  // >4 vertex polygons: fall back to dual pitch (hip requires straight skeleton)
  if (n > 4) {
    return buildDualRoof(footprint, wallTopZ, massId, lastStorey, pitch, ridgeEdgeParam);
  }

  const ridgeEdge = ridgeEdgeParam ?? longestEdge(footprint);
  const g = pitchedRoofGeometry(footprint, ridgeEdge);

  // For 4-vertex polygons, the opposite edge vertices are at known indices
  const oA = footprint[(ridgeEdge + 2) % n];
  const oB = footprint[(ridgeEdge + 3) % n];

  const tanP = Math.tan((pitch * Math.PI) / 180);
  const rise = g.halfSpan * tanP;
  const ridgeZ = wallTopZ + rise;

  // Ridge line: inset by halfSpan from each end along the edge direction
  const rA: Vec3 = snapVec3([
    g.eA[0] + g.px * g.halfSpan + g.ux * g.halfSpan,
    g.eA[1] + g.py * g.halfSpan + g.uy * g.halfSpan,
    ridgeZ,
  ]);
  const rB: Vec3 = snapVec3([
    g.eB[0] + g.px * g.halfSpan - g.ux * g.halfSpan,
    g.eB[1] + g.py * g.halfSpan - g.uy * g.halfSpan,
    ridgeZ,
  ]);

  const faces: Face[] = [];

  // Eaves-side trapezoid (ridgeEdge side): eA -> eB -> rB -> rA
  const plane0: Vec3[] = [
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    rB, rA,
  ];
  faces.push(makeFace(`${massId}_roof_p0`, plane0, massId, lastStorey, "roof", "external"));

  // Opposite-side trapezoid: oA -> oB -> rA -> rB
  const plane1: Vec3[] = [
    snapVec3([oA[0], oA[1], wallTopZ]),
    snapVec3([oB[0], oB[1], wallTopZ]),
    rA, rB,
  ];
  faces.push(makeFace(`${massId}_roof_p1`, plane1, massId, lastStorey, "roof", "external"));

  // Hip triangle at eB end: eB -> oA -> rB
  const plane2: Vec3[] = [
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    snapVec3([oA[0], oA[1], wallTopZ]),
    rB,
  ];
  faces.push(makeFace(`${massId}_roof_p2`, plane2, massId, lastStorey, "roof", "external"));

  // Hip triangle at eA end: oB -> eA -> rA
  const plane3: Vec3[] = [
    snapVec3([oB[0], oB[1], wallTopZ]),
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    rA,
  ];
  faces.push(makeFace(`${massId}_roof_p3`, plane3, massId, lastStorey, "roof", "external"));

  return faces;
}
