import type { BuildingSpec, Face, FaceModel } from "../types.js";
import { extrudeWalls } from "./walls.js";
import { buildFloor } from "./floor.js";
import { buildRoof } from "./roof.js";
import { placeComponents } from "./components.js";
import { placeOpenings } from "./openings.js";
import { buildTopology } from "./topology.js";
import { detectAbutments } from "./abutment.js";

export function resolve(spec: BuildingSpec): FaceModel {
  const faces: Face[] = [];

  for (let mi = 0; mi < spec.masses.length; mi++) {
    const mass = spec.masses[mi];
    const massId = mass.id ?? `mass_${mi}`;

    faces.push(...extrudeWalls(mass, massId));
    faces.push(buildFloor(mass, massId));
    faces.push(...buildRoof(mass, massId));
    placeComponents(faces, mass, massId);
    placeOpenings(faces, mass, massId);
  }

  detectAbutments(faces);

  return buildTopology(faces);
}
