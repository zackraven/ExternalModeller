import type { Vec2, Vec3, Face } from "../types.js";
import { snapVec3 } from "../geometry.js";

const SNAP = 1e-4;

/**
 * For a given footprint edge A→B, intersect the vertical wall plane with all
 * roof face polygons to find the roof profile above the edge.
 *
 * Returns profile points ordered from B back to A (matching existing gable
 * winding: [A_bot, B_bot, ...profile]).
 *
 * Only returns points strictly above wallTopZ.
 */
export function wallTopProfile(
  edgeA: Vec2, edgeB: Vec2, wallTopZ: number, roofFaces: Face[],
): Vec3[] {
  const ex = edgeB[0] - edgeA[0];
  const ey = edgeB[1] - edgeA[1];
  const edgeLen = Math.sqrt(ex * ex + ey * ey);
  if (edgeLen < SNAP) return [];

  // Wall plane normal (horizontal, pointing outward from CCW footprint)
  const nx = -ey / edgeLen;
  const ny = ex / edgeLen;
  const d0 = nx * edgeA[0] + ny * edgeA[1];

  // Unit vector along the edge (A→B)
  const ux = ex / edgeLen;
  const uy = ey / edgeLen;

  // Collect (t, z) hits where roof face edges cross the wall plane
  const hits: { t: number; z: number }[] = [];

  for (const face of roofFaces) {
    const verts = face.vertices;
    const n = verts.length;

    // Signed distance of each vertex from the wall plane
    const dists = verts.map(v => nx * v[0] + ny * v[1] - d0);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dI = dists[i];
      const dJ = dists[j];

      // Vertex ON the plane
      if (Math.abs(dI) < SNAP) {
        const dx = verts[i][0] - edgeA[0];
        const dy = verts[i][1] - edgeA[1];
        const t = dx * ux + dy * uy;
        const tNorm = t / edgeLen;
        if (tNorm >= -SNAP && tNorm <= 1 + SNAP) {
          hits.push({ t: Math.max(0, Math.min(1, tNorm)), z: verts[i][2] });
        }
      }

      // Edge crossing: sign change and neither endpoint is ON
      if (Math.abs(dI) >= SNAP && Math.abs(dJ) >= SNAP && dI * dJ < 0) {
        const frac = dI / (dI - dJ);
        const cx = verts[i][0] + frac * (verts[j][0] - verts[i][0]);
        const cy = verts[i][1] + frac * (verts[j][1] - verts[i][1]);
        const cz = verts[i][2] + frac * (verts[j][2] - verts[i][2]);

        const dx = cx - edgeA[0];
        const dy = cy - edgeA[1];
        const t = dx * ux + dy * uy;
        const tNorm = t / edgeLen;
        if (tNorm >= -SNAP && tNorm <= 1 + SNAP) {
          hits.push({ t: Math.max(0, Math.min(1, tNorm)), z: cz });
        }
      }
    }
  }

  // Filter to points above wallTopZ, deduplicate
  const above = hits.filter(h => h.z > wallTopZ + SNAP);
  if (above.length === 0) return [];

  // Sort descending by t (B back to A)
  above.sort((a, b) => b.t - a.t);

  // Deduplicate close points
  const deduped: { t: number; z: number }[] = [above[0]];
  for (let i = 1; i < above.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (Math.abs(above[i].t - prev.t) > SNAP / edgeLen || Math.abs(above[i].z - prev.z) > SNAP) {
      deduped.push(above[i]);
    }
  }

  // Convert back to Vec3
  return deduped.map(h => snapVec3([
    edgeA[0] + h.t * ex,
    edgeA[1] + h.t * ey,
    h.z,
  ]));
}
