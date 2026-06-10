import * as THREE from "three";
import type { Face, FaceOpening, Vec3 } from "@sap-geometry/core";
import { triangulate } from "./triangulate";

/**
 * Convert a Face into a Three.js BufferGeometry with positions and normals.
 * When the face has openings, their vertices are passed as holes to earcut.
 */
export function buildFaceGeometry(face: Face): THREE.BufferGeometry {
  const holes = face.openings.length > 0
    ? face.openings.map((o) => o.vertices)
    : undefined;

  const indices = triangulate(face.vertices, face.normal, holes);

  // Combined vertex list: face boundary + all opening vertices
  const allVertices: Vec3[] = [...face.vertices];
  if (holes) {
    for (const hole of holes) {
      allVertices.push(...hole);
    }
  }

  const positions = new Float32Array(allVertices.length * 3);
  const normals = new Float32Array(allVertices.length * 3);

  for (let i = 0; i < allVertices.length; i++) {
    positions[i * 3 + 0] = allVertices[i][0];
    positions[i * 3 + 1] = allVertices[i][1];
    positions[i * 3 + 2] = allVertices[i][2];
    normals[i * 3 + 0] = face.normal[0];
    normals[i * 3 + 1] = face.normal[1];
    normals[i * 3 + 2] = face.normal[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Build a simple BufferGeometry for an opening polygon (for the colored fill).
 * Vertices are offset slightly along the face normal to avoid z-fighting.
 */
export function buildOpeningGeometry(
  opening: FaceOpening,
  normal: Vec3,
): THREE.BufferGeometry {
  const OFFSET = 0.005; // 5mm offset to avoid z-fighting
  const verts = opening.vertices;

  const indices = triangulate(verts, normal);

  const positions = new Float32Array(verts.length * 3);
  const norms = new Float32Array(verts.length * 3);

  for (let i = 0; i < verts.length; i++) {
    positions[i * 3 + 0] = verts[i][0] + normal[0] * OFFSET;
    positions[i * 3 + 1] = verts[i][1] + normal[1] * OFFSET;
    positions[i * 3 + 2] = verts[i][2] + normal[2] * OFFSET;
    norms[i * 3 + 0] = normal[0];
    norms[i * 3 + 1] = normal[1];
    norms[i * 3 + 2] = normal[2];
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(norms, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Compute the centroid of a face's vertices.
 */
export function faceCentroid(face: Face): [number, number, number] {
  const n = face.vertices.length;
  let x = 0, y = 0, z = 0;
  for (const v of face.vertices) {
    x += v[0];
    y += v[1];
    z += v[2];
  }
  return [x / n, y / n, z / n];
}

/**
 * Compute the bounding box center of a set of faces, for centering the camera.
 */
export function boundingBoxCenter(faces: Face[]): [number, number, number] {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const face of faces) {
    for (const v of face.vertices) {
      minX = Math.min(minX, v[0]);
      minY = Math.min(minY, v[1]);
      minZ = Math.min(minZ, v[2]);
      maxX = Math.max(maxX, v[0]);
      maxY = Math.max(maxY, v[1]);
      maxZ = Math.max(maxZ, v[2]);
    }
  }

  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}
