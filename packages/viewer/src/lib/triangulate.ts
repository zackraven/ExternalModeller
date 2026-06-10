import earcut from "earcut";
import type { Vec3 } from "@sap-geometry/core";

/**
 * Triangulate a 3D polygon, optionally with holes.
 * For simple polygons (no holes): quads/triangles use a fan, 5+ use earcut.
 * When holes are provided, all vertices are combined and earcut handles the rest.
 */
export function triangulate(
  vertices: Vec3[],
  normal: Vec3,
  holes?: Vec3[][],
): number[] {
  const n = vertices.length;
  if (n < 3) return [];

  // Fast paths only when there are no holes
  if (!holes || holes.length === 0) {
    if (n === 3) return [0, 1, 2];
    if (n === 4) return [0, 1, 2, 0, 2, 3];
  }

  // Build combined vertex list: outer boundary + all hole vertices
  const allVertices: Vec3[] = [...vertices];
  const holeIndices: number[] = [];

  if (holes) {
    for (const hole of holes) {
      holeIndices.push(allVertices.length);
      allVertices.push(...hole);
    }
  }

  // Project to 2D and flatten for earcut
  const coords2d = projectTo2D(allVertices, normal);
  const flat: number[] = [];
  for (const [u, v] of coords2d) {
    flat.push(u, v);
  }

  const indices = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined);
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
