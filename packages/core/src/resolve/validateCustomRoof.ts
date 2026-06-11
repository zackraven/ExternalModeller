import type { CustomRoofFace, Vec2 } from "../types.js";
import { newell, dot, sub, shoelace } from "../geometry.js";
import polygonClipping from "polygon-clipping";

const SNAP = 1e-4;
const PLANARITY_TOL = 0.01; // metres
const COVERAGE_GAP_TOL = 0.01; // m²

export interface RoofValidationError {
  face: number;
  severity: "error" | "warning";
  message: string;
}

/**
 * Validate custom roof faces for common errors.
 *
 * Checks:
 * 1. Degenerate faces (< 3 vertices, zero area)
 * 2. Planarity (all vertices lie on the plane defined by the Newell normal)
 * 3. Altitude (all vertices >= wallTopZ)
 * 4. Plan coverage (XY projection covers the footprint)
 */
export function validateCustomRoof(
  faces: CustomRoofFace[],
  footprint: Vec2[],
  wallTopZ: number,
): RoofValidationError[] {
  const errors: RoofValidationError[] = [];

  for (let i = 0; i < faces.length; i++) {
    const poly = faces[i].polygon;

    // Degenerate: too few vertices
    if (poly.length < 3) {
      errors.push({ face: i, severity: "error", message: "Face has fewer than 3 vertices" });
      continue;
    }

    // Degenerate: zero area
    const { area, normal } = newell(poly);
    if (area < SNAP) {
      errors.push({ face: i, severity: "error", message: "Face has zero or near-zero area" });
      continue;
    }

    // Planarity: check each vertex distance from the mean plane
    const cx = poly.reduce((s, v) => s + v[0], 0) / poly.length;
    const cy = poly.reduce((s, v) => s + v[1], 0) / poly.length;
    const cz = poly.reduce((s, v) => s + v[2], 0) / poly.length;
    for (let j = 0; j < poly.length; j++) {
      const d = Math.abs(
        dot(normal, sub(poly[j], [cx, cy, cz])),
      );
      if (d > PLANARITY_TOL) {
        errors.push({
          face: i,
          severity: "error",
          message: `Vertex ${j} is ${d.toFixed(3)}m from the face plane (tolerance ${PLANARITY_TOL}m)`,
        });
      }
    }

    // Altitude: all vertices >= wallTopZ
    for (let j = 0; j < poly.length; j++) {
      if (poly[j][2] < wallTopZ - SNAP) {
        errors.push({
          face: i,
          severity: "error",
          message: `Vertex ${j} z=${poly[j][2].toFixed(3)} is below wallTopZ=${wallTopZ}`,
        });
      }
    }
  }

  // Plan coverage: XY projections of faces should cover the footprint
  if (faces.length > 0 && faces.every(f => f.polygon.length >= 3)) {
    const facePolygons: polygonClipping.Polygon[] = faces.map(f => {
      const ring: [number, number][] = f.polygon.map(v => [v[0], v[1]]);
      return [ring];
    });

    // Union all face XY projections
    let faceUnion: polygonClipping.MultiPolygon;
    if (facePolygons.length === 1) {
      faceUnion = [facePolygons[0]];
    } else {
      faceUnion = polygonClipping.union(facePolygons[0], ...facePolygons.slice(1));
    }

    // Compute difference: footprint minus face union = uncovered area
    const footprintPoly: polygonClipping.Polygon = [
      footprint.map(v => [v[0], v[1]] as [number, number]),
    ];

    const gap = polygonClipping.difference(footprintPoly, ...faceUnion);

    // Sum gap area
    let gapArea = 0;
    for (const poly of gap) {
      for (const ring of poly) {
        gapArea += Math.abs(shoelace(ring as Vec2[]));
      }
    }

    if (gapArea > COVERAGE_GAP_TOL) {
      errors.push({
        face: -1,
        severity: "warning",
        message: `Roof faces leave ${gapArea.toFixed(3)}m² of footprint uncovered in plan`,
      });
    }
  }

  return errors;
}
