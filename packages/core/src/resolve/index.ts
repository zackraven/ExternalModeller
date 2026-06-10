import type { BuildingSpec, Face, FaceModel } from "../types.js";
import { extrudeWalls } from "./walls.js";
import { buildFloor } from "./floor.js";
import { placeOpenings } from "./openings.js";
import { buildTopology } from "./topology.js";

export function resolve(spec: BuildingSpec): FaceModel {
  const faces: Face[] = [];

  for (let mi = 0; mi < spec.masses.length; mi++) {
    const mass = spec.masses[mi];
    const massId = mass.id ?? `mass_${mi}`;

    faces.push(...extrudeWalls(mass, massId));
    faces.push(buildFloor(mass, massId));
    placeOpenings(faces, mass, massId);
  }

  return buildTopology(faces);
}
