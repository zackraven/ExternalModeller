import type { Mass, Face, Vec3 } from "../types.js";
import { ensureCCW, snap } from "../geometry.js";

/**
 * Place openings on wall faces. Mutates faces by adding FaceOpening
 * entries to matching host walls.
 */
export function placeOpenings(
  faces: Face[],
  mass: Mass,
  massId: string,
): void {
  if (!mass.openings?.length) return;

  const footprint = ensureCCW(mass.footprint);
  const n = footprint.length;

  // Pre-compute storey base heights
  const storeyBases: number[] = [];
  let z = 0;
  for (const s of mass.storeys) {
    storeyBases.push(z);
    z += s.height;
  }

  for (const opening of mass.openings) {
    const si = opening.storey;
    const ei = opening.edge;
    const faceId = `${massId}_wall_s${si}_e${ei}`;
    const face = faces.find((f) => f.id === faceId);
    if (!face) continue;

    const a = footprint[ei];
    const b = footprint[(ei + 1) % n];

    // Wall direction and length
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const wallLen = Math.sqrt(dx * dx + dy * dy);
    if (wallLen < 1e-6) continue;
    const along: [number, number] = [dx / wallLen, dy / wallLen];

    const zBase = storeyBases[si];
    const sill = opening.sill ?? (opening.type === "door" ? 0 : 0.9);
    const count = opening.count ?? 1;

    // Distribute openings evenly along the wall
    const segment = wallLen / count;
    for (let i = 0; i < count; i++) {
      const center = segment * (i + 0.5);
      const left = center - opening.width / 2;
      const right = center + opening.width / 2;
      const zBot = zBase + sill;
      const zTop = zBot + opening.height;

      // Vertices wound same as host wall face (outward normal)
      const vertices: Vec3[] = [
        [snap(a[0] + along[0] * left), snap(a[1] + along[1] * left), snap(zBot)],
        [snap(a[0] + along[0] * right), snap(a[1] + along[1] * right), snap(zBot)],
        [snap(a[0] + along[0] * right), snap(a[1] + along[1] * right), snap(zTop)],
        [snap(a[0] + along[0] * left), snap(a[1] + along[1] * left), snap(zTop)],
      ];

      const area = Math.round(opening.width * opening.height * 1e6) / 1e6;
      const suffix = count > 1 ? `_${i}` : "";

      face.openings.push({
        id: `${faceId}_${opening.type}${suffix}`,
        vertices,
        area,
        type: opening.type,
      });
    }
  }
}
