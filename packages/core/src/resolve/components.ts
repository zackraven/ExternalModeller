import type { Mass, Face, Vec3, Component } from "../types.js";
import { newell, snapVec3, dot, sub, normalize } from "../geometry.js";
import polygonClipping from "polygon-clipping";

/**
 * Place components (dormers, rooflights) on roof faces.
 * Mutates faces[] — adds dormer faces, cuts holes in host roofs,
 * and adds rooflight openings.
 */
export function placeComponents(
  faces: Face[],
  mass: Mass,
  massId: string,
): void {
  if (!mass.components?.length) return;

  const lastStorey = mass.storeys.length - 1;

  for (let ci = 0; ci < mass.components.length; ci++) {
    const comp = mass.components[ci];

    // Find host roof face
    const hostId = `${massId}_roof_p${comp.roofPlane}`;
    const hostFace = faces.find((f) => f.id === hostId);
    if (!hostFace) continue;

    if (comp.kind === "dormer") {
      placeDormer(faces, hostFace, comp, ci, massId, lastStorey);
    } else if (comp.kind === "rooflight") {
      placeRooflight(hostFace, comp, ci, massId);
    }
  }
}

// ── Roof-plane local coordinate system ──────────────────────

function roofPlaneCoords(face: Face) {
  const v = face.vertices;
  const uAxis = normalize(sub(v[1], v[0]));  // along eaves edge
  const vAxis = normalize(sub(v[2], v[1]));  // up-slope direction
  const origin: Vec3 = [
    (v[0][0] + v[1][0]) / 2,
    (v[0][1] + v[1][1]) / 2,
    (v[0][2] + v[1][2]) / 2,
  ];
  return { uAxis, vAxis, origin };
}

function to2D(
  pt: Vec3, origin: Vec3, uAxis: Vec3, vAxis: Vec3,
): [number, number] {
  const d = sub(pt, origin);
  return [dot(d, uAxis), dot(d, vAxis)];
}

function to3D(
  u: number, v: number, origin: Vec3, uAxis: Vec3, vAxis: Vec3,
): Vec3 {
  return snapVec3([
    origin[0] + u * uAxis[0] + v * vAxis[0],
    origin[1] + u * uAxis[1] + v * vAxis[1],
    origin[2] + u * uAxis[2] + v * vAxis[2],
  ]);
}

// ── Dormer ──────────────────────────────────────────────────

function placeDormer(
  faces: Face[],
  hostFace: Face,
  comp: Component,
  ci: number,
  massId: string,
  lastStorey: number,
): void {
  const { uAxis, vAxis, origin } = roofPlaneCoords(hostFace);
  const halfW = comp.width / 2;

  // Horizontal direction perpendicular to eaves (from eaves toward ridge)
  // hLen = cos(pitch), vAxis[2] = sin(pitch)
  const hLen = Math.sqrt(vAxis[0] * vAxis[0] + vAxis[1] * vAxis[1]);
  const hDir: Vec3 = [vAxis[0] / hLen, vAxis[1] / hLen, 0];
  const tanPitch = vAxis[2] / hLen;

  // Horizontal depth: default = height / tan(pitch) so the flat dormer roof
  // meets the sloping main roof exactly where it reaches ridgeZ.
  const projection = comp.projection ?? (comp.height / tanPitch);

  // v-distance along the roof slope for the footprint hole
  const vHole = projection / hLen;

  const baseZ = origin[2];
  const ridgeZ = baseZ + comp.height;

  // Front face corners (at eaves line, v=0)
  const frontBL: Vec3 = snapVec3([
    origin[0] - halfW * uAxis[0],
    origin[1] - halfW * uAxis[1],
    baseZ,
  ]);
  const frontBR: Vec3 = snapVec3([
    origin[0] + halfW * uAxis[0],
    origin[1] + halfW * uAxis[1],
    baseZ,
  ]);
  const frontTL: Vec3 = snapVec3([frontBL[0], frontBL[1], ridgeZ]);
  const frontTR: Vec3 = snapVec3([frontBR[0], frontBR[1], ridgeZ]);

  // Back corners (dormer roof back edge, flat at ridgeZ).
  // At the default projection these sit exactly on the main roof surface.
  const backTL: Vec3 = snapVec3([
    frontTL[0] + hDir[0] * projection,
    frontTL[1] + hDir[1] * projection,
    ridgeZ,
  ]);
  const backTR: Vec3 = snapVec3([
    frontTR[0] + hDir[0] * projection,
    frontTR[1] + hDir[1] * projection,
    ridgeZ,
  ]);

  // ── Front face (vertical quad, outward normal away from ridge) ──
  const frontVerts: Vec3[] = [frontBL, frontBR, frontTR, frontTL];
  const frontGeom = newell(frontVerts);
  const frontFace: Face = {
    id: `${massId}_dormer_${ci}_front`,
    vertices: frontVerts,
    normal: frontGeom.normal,
    area: frontGeom.area,
    tag: { mass: massId, storey: lastStorey, type: "dormer_front", adjacency: "external" },
    openings: [],
  };
  faces.push(frontFace);

  // ── Left cheek (triangle, normal = -uAxis) ──
  // frontBL → frontTL → backTL: CCW from -uAxis side
  const leftVerts: Vec3[] = [frontBL, frontTL, backTL];
  const leftGeom = newell(leftVerts);
  faces.push({
    id: `${massId}_dormer_${ci}_cheek_l`,
    vertices: leftVerts,
    normal: leftGeom.normal,
    area: leftGeom.area,
    tag: { mass: massId, storey: lastStorey, type: "dormer_cheek", adjacency: "external" },
    openings: [],
  });

  // ── Right cheek (triangle, normal = +uAxis) ──
  // frontBR → backTR → frontTR: CCW from +uAxis side
  const rightVerts: Vec3[] = [frontBR, backTR, frontTR];
  const rightGeom = newell(rightVerts);
  faces.push({
    id: `${massId}_dormer_${ci}_cheek_r`,
    vertices: rightVerts,
    normal: rightGeom.normal,
    area: rightGeom.area,
    tag: { mass: massId, storey: lastStorey, type: "dormer_cheek", adjacency: "external" },
    openings: [],
  });

  // ── Dormer roof (flat at ridgeZ, tilt ≈ 0°) ──
  // CCW winding from above: frontTL → frontTR → backTR → backTL
  const roofVerts: Vec3[] = [frontTL, frontTR, backTR, backTL];
  const roofGeom = newell(roofVerts);
  faces.push({
    id: `${massId}_dormer_${ci}_roof`,
    vertices: roofVerts,
    normal: roofGeom.normal,
    area: roofGeom.area,
    tag: { mass: massId, storey: lastStorey, type: "dormer_roof", adjacency: "external" },
    openings: [],
  });

  // ── Window on front face ──
  if (comp.window) {
    const wHalfW = comp.window.width / 2;
    const wHalfH = comp.window.height / 2;
    const centerZ = baseZ + comp.height / 2;

    const wBL: Vec3 = snapVec3([
      origin[0] - wHalfW * uAxis[0],
      origin[1] - wHalfW * uAxis[1],
      centerZ - wHalfH,
    ]);
    const wBR: Vec3 = snapVec3([
      origin[0] + wHalfW * uAxis[0],
      origin[1] + wHalfW * uAxis[1],
      centerZ - wHalfH,
    ]);
    const wTR: Vec3 = snapVec3([
      origin[0] + wHalfW * uAxis[0],
      origin[1] + wHalfW * uAxis[1],
      centerZ + wHalfH,
    ]);
    const wTL: Vec3 = snapVec3([
      origin[0] - wHalfW * uAxis[0],
      origin[1] - wHalfW * uAxis[1],
      centerZ + wHalfH,
    ]);

    frontFace.openings.push({
      id: `${massId}_dormer_${ci}_window`,
      vertices: [wBL, wBR, wTR, wTL],
      area: Math.round(comp.window.width * comp.window.height * 1e6) / 1e6,
      type: "window",
    });
  }

  // ── Cut dormer footprint from host roof ──
  // Use vHole (slope distance) so the hole matches the dormer's horizontal extent
  subtractFootprintFromHost(hostFace, uAxis, vAxis, origin, halfW, vHole);
}

// ── Host roof polygon boolean subtraction ───────────────────

function subtractFootprintFromHost(
  hostFace: Face,
  uAxis: Vec3,
  vAxis: Vec3,
  origin: Vec3,
  halfW: number,
  projection: number,
): void {
  // Convert host face vertices to 2D roof-plane coords
  const host2D: [number, number][] = hostFace.vertices.map(
    (v) => to2D(v, origin, uAxis, vAxis),
  );

  // Dormer footprint rectangle in 2D roof-plane coords
  const footprint: [number, number][] = [
    [-halfW, 0],
    [halfW, 0],
    [halfW, projection],
    [-halfW, projection],
  ];

  // polygon-clipping difference
  const result = polygonClipping.difference(
    [host2D] as polygonClipping.Polygon,
    [footprint] as polygonClipping.Polygon,
  );

  if (result.length > 0 && result[0].length > 0) {
    // Take the outer ring of the first result polygon
    const newVerts2D = result[0][0];
    const newVerts3D: Vec3[] = newVerts2D.map(
      ([u, v]) => to3D(u, v, origin, uAxis, vAxis),
    );

    const { area, normal } = newell(newVerts3D);
    hostFace.vertices = newVerts3D;
    hostFace.area = area;
    hostFace.normal = normal;
  }
}

// ── Rooflight ───────────────────────────────────────────────

function placeRooflight(
  hostFace: Face,
  comp: Component,
  ci: number,
  massId: string,
): void {
  const { uAxis, vAxis, origin } = roofPlaneCoords(hostFace);

  // Compute centroid of host face in 2D coords
  let cu = 0;
  let cv = 0;
  for (const pt of hostFace.vertices) {
    const [u, v] = to2D(pt, origin, uAxis, vAxis);
    cu += u;
    cv += v;
  }
  cu /= hostFace.vertices.length;
  cv /= hostFace.vertices.length;

  const halfW = comp.width / 2;
  const halfH = comp.height / 2;

  // Rectangle corners in 2D, centered on the face
  const corners3D: Vec3[] = [
    to3D(cu - halfW, cv - halfH, origin, uAxis, vAxis),
    to3D(cu + halfW, cv - halfH, origin, uAxis, vAxis),
    to3D(cu + halfW, cv + halfH, origin, uAxis, vAxis),
    to3D(cu - halfW, cv + halfH, origin, uAxis, vAxis),
  ];

  hostFace.openings.push({
    id: `${massId}_rooflight_${ci}`,
    vertices: corners3D,
    area: Math.round(comp.width * comp.height * 1e6) / 1e6,
    type: "rooflight",
  });
}
