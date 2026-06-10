import type { Face, FaceModel, SurfaceRow, OpeningRow } from "../types.js";
import { azimuthOf, tiltOf } from "../geometry.js";

export function extractSurfaces(
  model: FaceModel,
  northAngle: number,
): { surfaces: SurfaceRow[]; openings: OpeningRow[] } {
  const surfaces: SurfaceRow[] = [];
  const openings: OpeningRow[] = [];

  for (const face of model.faces) {
    const tilt = tiltOf(face.normal);
    const azimuth = tilt < 1 ? 0 : azimuthOf(face.normal, northAngle);
    const openingArea = face.openings.reduce((s, o) => s + o.area, 0);

    surfaces.push({
      name: faceName(face),
      mass: face.tag.mass,
      storey: face.tag.storey,
      type: face.tag.type,
      adjacency: face.tag.adjacency,
      area: face.area - openingArea,
      azimuth,
      tilt,
    });

    for (const op of face.openings) {
      openings.push({
        name: op.id,
        host: face.id,
        type: op.type,
        area: op.area,
        azimuth,
        tilt,
      });
    }
  }

  return { surfaces, openings };
}

function faceName(face: Face): string {
  const t = face.tag;
  if (t.type === "wall") {
    if (face.id.includes("_gable_")) return `Gable E${t.edge}`;
    return `Wall S${t.storey} E${t.edge}`;
  }
  if (t.type === "floor") return "Floor";
  if (t.type === "roof") return `Roof P${face.id.slice(face.id.lastIndexOf("p") + 1)}`;
  if (t.type === "dormer_front" || t.type === "dormer_cheek" || t.type === "dormer_roof") {
    const m = face.id.match(/_dormer_(\d+)_/);
    const ci = m ? m[1] : "0";
    if (t.type === "dormer_front") return `Dormer ${ci} Front`;
    if (t.type === "dormer_cheek") return `Dormer ${ci} Cheek`;
    return `Dormer ${ci} Roof`;
  }
  return face.id;
}
