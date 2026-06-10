import type { Face, Vec3 } from "../types.js";
import { snap } from "../geometry.js";

function vertexKey2D(v: Vec3): string {
  return `${snap(v[0])},${snap(v[1])}`;
}

/**
 * Canonical key for a 2D footprint edge (ignoring z).
 * Sort endpoints lexicographically so A->B and B->A produce the same key.
 */
function canonicalEdgeKey(a: Vec3, b: Vec3): string {
  const ka = vertexKey2D(a);
  const kb = vertexKey2D(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Detect shared footprint edges between masses and tag overlapping
 * wall faces as party adjacency.
 *
 * Mutates face tags in place. Only overrides faces currently tagged
 * as "external" (preserves manual overrides).
 */
export function detectAbutments(faces: Face[]): void {
  // Filter to wall faces only
  const walls = faces.filter((f) => f.tag.type === "wall");

  // Group walls by their canonical 2D bottom-edge key
  const groups = new Map<string, Face[]>();
  for (const wall of walls) {
    // Bottom edge is vertices[0] -> vertices[1] (A_bot -> B_bot)
    const key = canonicalEdgeKey(wall.vertices[0], wall.vertices[1]);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push(wall);
  }

  // For each group with walls from 2+ distinct masses, check z-overlap
  for (const group of groups.values()) {
    // Need at least 2 walls to have a shared edge
    if (group.length < 2) continue;

    // Check if there are walls from different masses
    const masses = new Set(group.map((f) => f.tag.mass));
    if (masses.size < 2) continue;

    // Check every pair for z-range overlap
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];

        // Only pair walls from different masses
        if (a.tag.mass === b.tag.mass) continue;

        // Z-range: zBase from bottom vertex, zTop from top vertex
        const aZBase = a.vertices[0][2];
        const aZTop = a.vertices[2][2];
        const bZBase = b.vertices[0][2];
        const bZTop = b.vertices[2][2];

        // Overlap if max(bases) < min(tops)
        if (Math.max(aZBase, bZBase) < Math.min(aZTop, bZTop)) {
          if (a.tag.adjacency === "external") a.tag.adjacency = "party";
          if (b.tag.adjacency === "external") b.tag.adjacency = "party";
        }
      }
    }
  }
}
