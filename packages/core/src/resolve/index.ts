import type { BuildingSpec, Face, FaceModel } from "../types.js";
import { extrudeWalls } from "./walls.js";
import { buildFloor } from "./floor.js";
import { buildRoof } from "./roof.js";
import { buildCutSolid } from "./cutRoof.js";
import { placeComponents } from "./components.js";
import { placeOpenings } from "./openings.js";
import { buildTopology } from "./topology.js";
import { detectAbutments } from "./abutment.js";
import { computeOcclusion } from "./occlusion.js";

export function resolve(spec: BuildingSpec): FaceModel {
  const faces: Face[] = [];

  for (let mi = 0; mi < spec.masses.length; mi++) {
    const mass = spec.masses[mi];
    const massId = mass.id ?? `mass_${mi}`;

    if (mass.roof?.type === "cuts") {
      faces.push(...buildCutSolid(mass, massId));
    } else {
      faces.push(...extrudeWalls(mass, massId));
      faces.push(buildFloor(mass, massId));
      faces.push(...buildRoof(mass, massId));
    }
    placeComponents(faces, mass, massId);
    placeOpenings(faces, mass, massId);
  }

  detectAbutments(faces);
  computeOcclusion(faces);

  return buildTopology(faces);
}
