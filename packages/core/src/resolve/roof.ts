import type { Mass, Face, Vec2, Vec3 } from "../types.js";
import { newell, ensureCCW, snapVec3 } from "../geometry.js";

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

// ── Flat ────────────────────────────────────────────────────

function buildFlatRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
): Face[] {
  // CCW winding at wallTopZ → normal +Z
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

// ── Helpers for pitched roofs ───────────────────────────────

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
 * For a rectangular footprint, compute the ridge geometry relative to a given eaves edge.
 * Returns the 4 corners in a canonical order and the perpendicular span.
 *
 * Edges are numbered CCW. For ridgeEdge=0 (south edge) on a 10×6 box:
 *   edge 0: (0,0)→(10,0) south
 *   edge 1: (10,0)→(10,6) east
 *   edge 2: (10,6)→(0,6) north
 *   edge 3: (0,6)→(0,0) west
 *
 * The ridge runs parallel to the eaves edge (ridgeEdge), centered over the footprint.
 * "halfSpan" is the perpendicular distance from eaves edge to ridge.
 */
function rectRoofGeometry(footprint: Vec2[], ridgeEdge: number) {
  const n = footprint.length;
  // The eaves edge and the opposite edge
  const eA = footprint[ridgeEdge];
  const eB = footprint[(ridgeEdge + 1) % n];
  const oA = footprint[(ridgeEdge + 2) % n];
  const oB = footprint[(ridgeEdge + 3) % n];

  // Edge direction (along eaves)
  const edx = eB[0] - eA[0];
  const edy = eB[1] - eA[1];
  const edgeLen = Math.sqrt(edx * edx + edy * edy);

  // Perpendicular direction (from eaves toward opposite edge)
  // For CCW winding, the inward perpendicular is (-edy, edx) normalized
  const px = -edy / edgeLen;
  const py = edx / edgeLen;

  // Span = perpendicular distance from eaves edge to opposite edge
  // Project (oB - eA) onto perpendicular direction
  const span = Math.abs((oB[0] - eA[0]) * px + (oB[1] - eA[1]) * py);
  const halfSpan = span / 2;

  // Ridge midline: offset from eaves by halfSpan in perpendicular direction
  const ridgeMidX = px * halfSpan;
  const ridgeMidY = py * halfSpan;

  return {
    eA, eB,    // eaves edge start/end (CCW)
    oA, oB,    // opposite edge start/end (CCW)
    edx, edy,  // edge direction
    edgeLen,
    px, py,    // perpendicular unit vector (eaves→opposite)
    span,
    halfSpan,
    ridgeMidX, ridgeMidY,
  };
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

// ── Mono ────────────────────────────────────────────────────

function buildMonoRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
  pitch: number, ridgeEdgeParam?: number,
): Face[] {
  const ridgeEdge = ridgeEdgeParam ?? longestEdge(footprint);
  const g = rectRoofGeometry(footprint, ridgeEdge);
  const n = footprint.length;

  const tanP = Math.tan((pitch * Math.PI) / 180);
  const rise = g.span * tanP;
  const highZ = wallTopZ + rise;

  // The eaves edge stays at wallTopZ, the opposite edge rises to highZ
  // Roof face: eA → eB at wallTopZ, then along opposite edge at highZ
  // Winding: CCW when viewed from outside (above)
  const roofVerts: Vec3[] = [
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    snapVec3([g.oA[0], g.oA[1], highZ]),
    snapVec3([g.oB[0], g.oB[1], highZ]),
  ];
  const faces: Face[] = [
    makeFace(`${massId}_roof_p0`, roofVerts, massId, lastStorey, "roof", "external"),
  ];

  // Gable wall triangles on the two side edges
  // Side 1: ridgeEdge+1 edge (eB → oA, but we need a triangle: eB_low, oA_low, oA_high)
  const sideEdge1 = (ridgeEdge + 1) % n;
  const sideEdge2 = (ridgeEdge + 3) % n;

  // Gable 1: triangle at eB side — eB at wallTopZ, oA at wallTopZ, oA at highZ
  const gable1: Vec3[] = [
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    snapVec3([g.oA[0], g.oA[1], wallTopZ]),
    snapVec3([g.oA[0], g.oA[1], highZ]),
  ];

  // Gable 2: triangle at oB side — oB at wallTopZ, eA at wallTopZ, oB at highZ
  // Winding must give outward normal
  const gable2: Vec3[] = [
    snapVec3([g.oB[0], g.oB[1], wallTopZ]),
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    snapVec3([g.oB[0], g.oB[1], highZ]),
  ];

  faces.push(makeFace(`${massId}_gable_e${sideEdge1}`, gable1, massId, lastStorey, "wall", "external", sideEdge1));
  faces.push(makeFace(`${massId}_gable_e${sideEdge2}`, gable2, massId, lastStorey, "wall", "external", sideEdge2));

  return faces;
}

// ── Dual ────────────────────────────────────────────────────

function buildDualRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
  pitch: number, ridgeEdgeParam?: number,
): Face[] {
  const ridgeEdge = ridgeEdgeParam ?? longestEdge(footprint);
  const g = rectRoofGeometry(footprint, ridgeEdge);
  const n = footprint.length;

  const tanP = Math.tan((pitch * Math.PI) / 180);
  const rise = g.halfSpan * tanP;
  const ridgeZ = wallTopZ + rise;

  // Ridge line: runs parallel to eaves edge, at midpoint of span
  const rA: Vec3 = snapVec3([
    g.eA[0] + g.ridgeMidX, g.eA[1] + g.ridgeMidY, ridgeZ,
  ]);
  const rB: Vec3 = snapVec3([
    g.eB[0] + g.ridgeMidX, g.eB[1] + g.ridgeMidY, ridgeZ,
  ]);

  const faces: Face[] = [];

  // Roof plane 0 (eaves side — ridgeEdge side):
  // eA_low → eB_low → rB → rA (CCW from outside = looking down from eaves side)
  const plane0: Vec3[] = [
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    rB, rA,
  ];
  faces.push(makeFace(`${massId}_roof_p0`, plane0, massId, lastStorey, "roof", "external"));

  // Roof plane 1 (opposite side):
  // oA_low → oB_low → rA → rB (CCW from outside = looking down from opposite side)
  // Note: oA is at (ridgeEdge+2), oB is at (ridgeEdge+3), going CCW
  // But for outward normal, we need: opposite eaves going the other direction
  const plane1: Vec3[] = [
    snapVec3([g.oA[0], g.oA[1], wallTopZ]),
    snapVec3([g.oB[0], g.oB[1], wallTopZ]),
    rA, rB,
  ];
  faces.push(makeFace(`${massId}_roof_p1`, plane1, massId, lastStorey, "roof", "external"));

  // Gable wall triangles on the two side edges
  const sideEdge1 = (ridgeEdge + 1) % n;
  const sideEdge2 = (ridgeEdge + 3) % n;

  // Gable at sideEdge1: triangle eB → oA → ridge_at_eB_side
  // For ridgeEdge=0 on 10×6 box: east gable at x=10
  // eB=(10,0), oA=(10,6), ridge midpoint at (10,3,ridgeZ)
  const gable1: Vec3[] = [
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    snapVec3([g.oA[0], g.oA[1], wallTopZ]),
    rB,
  ];
  faces.push(makeFace(`${massId}_gable_e${sideEdge1}`, gable1, massId, lastStorey, "wall", "external", sideEdge1));

  // Gable at sideEdge2: triangle oB → eA → ridge_at_oB_side
  // For ridgeEdge=0 on 10×6 box: west gable at x=0
  // oB=(0,6), eA=(0,0), ridge midpoint at (0,3,ridgeZ)
  const gable2: Vec3[] = [
    snapVec3([g.oB[0], g.oB[1], wallTopZ]),
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    rA,
  ];
  faces.push(makeFace(`${massId}_gable_e${sideEdge2}`, gable2, massId, lastStorey, "wall", "external", sideEdge2));

  return faces;
}

// ── Hip ─────────────────────────────────────────────────────

function buildHipRoof(
  footprint: Vec2[], wallTopZ: number, massId: string, lastStorey: number,
  pitch: number, ridgeEdgeParam?: number,
): Face[] {
  const ridgeEdge = ridgeEdgeParam ?? longestEdge(footprint);
  const g = rectRoofGeometry(footprint, ridgeEdge);

  const tanP = Math.tan((pitch * Math.PI) / 180);
  const rise = g.halfSpan * tanP;
  const ridgeZ = wallTopZ + rise;

  // Ridge line: inset by halfSpan from each end along the edge direction
  // Unit vector along edge
  const ux = g.edx / g.edgeLen;
  const uy = g.edy / g.edgeLen;

  const rA: Vec3 = snapVec3([
    g.eA[0] + g.ridgeMidX + ux * g.halfSpan,
    g.eA[1] + g.ridgeMidY + uy * g.halfSpan,
    ridgeZ,
  ]);
  const rB: Vec3 = snapVec3([
    g.eB[0] + g.ridgeMidX - ux * g.halfSpan,
    g.eB[1] + g.ridgeMidY - uy * g.halfSpan,
    ridgeZ,
  ]);

  const faces: Face[] = [];

  // Eaves-side trapezoid (ridgeEdge side): eA → eB → rB → rA
  const plane0: Vec3[] = [
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    rB, rA,
  ];
  faces.push(makeFace(`${massId}_roof_p0`, plane0, massId, lastStorey, "roof", "external"));

  // Opposite-side trapezoid: oA → oB → rA → rB
  const plane1: Vec3[] = [
    snapVec3([g.oA[0], g.oA[1], wallTopZ]),
    snapVec3([g.oB[0], g.oB[1], wallTopZ]),
    rA, rB,
  ];
  faces.push(makeFace(`${massId}_roof_p1`, plane1, massId, lastStorey, "roof", "external"));

  // Hip triangle at eB end (sideEdge1): eB → oA → rB
  const plane2: Vec3[] = [
    snapVec3([g.eB[0], g.eB[1], wallTopZ]),
    snapVec3([g.oA[0], g.oA[1], wallTopZ]),
    rB,
  ];
  faces.push(makeFace(`${massId}_roof_p2`, plane2, massId, lastStorey, "roof", "external"));

  // Hip triangle at eA end (sideEdge2): oB → eA → rA
  const plane3: Vec3[] = [
    snapVec3([g.oB[0], g.oB[1], wallTopZ]),
    snapVec3([g.eA[0], g.eA[1], wallTopZ]),
    rA,
  ];
  faces.push(makeFace(`${massId}_roof_p3`, plane3, massId, lastStorey, "roof", "external"));

  return faces;
}
