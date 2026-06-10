import type { Mass, Face, Vec3 } from "../types.js";
import { newell, ensureCCW } from "../geometry.js";

export function extrudeWalls(mass: Mass, massId: string): Face[] {
  const footprint = ensureCCW(mass.footprint);
  const faces: Face[] = [];
  let zBase = 0;

  for (let si = 0; si < mass.storeys.length; si++) {
    const zTop = zBase + mass.storeys[si].height;

    for (let ei = 0; ei < footprint.length; ei++) {
      const a = footprint[ei];
      const b = footprint[(ei + 1) % footprint.length];

      // Winding: [A_bot, B_bot, B_top, A_top] gives outward normal for CCW footprint
      const vertices: Vec3[] = [
        [a[0], a[1], zBase],
        [b[0], b[1], zBase],
        [b[0], b[1], zTop],
        [a[0], a[1], zTop],
      ];
      const { area, normal } = newell(vertices);

      let adjacency: Face["tag"]["adjacency"] = "external";
      if (mass.adjacency) {
        const ovr = mass.adjacency.find(
          (adj) => adj.storey === si && adj.edge === ei,
        );
        if (ovr) adjacency = ovr.type;
      }

      faces.push({
        id: `${massId}_wall_s${si}_e${ei}`,
        vertices,
        normal,
        area,
        tag: { mass: massId, storey: si, type: "wall", adjacency, edge: ei },
        openings: [],
      });
    }

    zBase = zTop;
  }

  return faces;
}
