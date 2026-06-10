import * as THREE from "three";
import type { Face } from "@sap-geometry/core";
import { triangulate } from "./triangulate";

/**
 * Convert a Face into a Three.js BufferGeometry with positions and normals.
 */
export function buildFaceGeometry(face: Face): THREE.BufferGeometry {
  const indices = triangulate(face.vertices, face.normal);
  const positions = new Float32Array(face.vertices.length * 3);
  const normals = new Float32Array(face.vertices.length * 3);

  for (let i = 0; i < face.vertices.length; i++) {
    positions[i * 3 + 0] = face.vertices[i][0];
    positions[i * 3 + 1] = face.vertices[i][1];
    positions[i * 3 + 2] = face.vertices[i][2];
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
