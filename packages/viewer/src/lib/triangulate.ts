import earcut from "earcut";
import type { Vec3 } from "@sap-geometry/core";

/**
 * Triangulate a 3D polygon.
 * For quads or triangles, uses a simple fan.
 * For 5+ vertices (potentially concave), projects to 2D and uses earcut.
 */
export function triangulate(vertices: Vec3[], normal: Vec3): number[] {
  const n = vertices.length;
  if (n < 3) return [];

  // Triangle — trivial
  if (n === 3) return [0, 1, 2];

  // Quad — fan
  if (n === 4) return [0, 1, 2, 0, 2, 3];

  // General polygon — project to 2D using the face normal, then earcut
  const coords2d = projectTo2D(vertices, normal);
  const flat: number[] = [];
  for (const [u, v] of coords2d) {
    flat.push(u, v);
  }

  const indices = earcut(flat);
  return indices;
}

/**
 * Project 3D vertices onto the plane defined by the face normal,
 * returning 2D coordinates suitable for earcut.
 */
function projectTo2D(vertices: Vec3[], normal: Vec3): [number, number][] {
  // Pick the axis most aligned with the normal to drop
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);

  if (az >= ax && az >= ay) {
    // Drop Z — project onto XY
    return vertices.map((v) => [v[0], v[1]]);
  } else if (ay >= ax) {
    // Drop Y — project onto XZ
    return vertices.map((v) => [v[0], v[2]]);
  } else {
    // Drop X — project onto YZ
    return vertices.map((v) => [v[1], v[2]]);
  }
}
