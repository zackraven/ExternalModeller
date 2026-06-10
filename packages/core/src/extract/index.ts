import type { FaceModel, Schedule, Totals } from "../types.js";
import { extractSurfaces } from "./surfaces.js";
import { extractJunctions } from "./junctions.js";

export function extract(model: FaceModel, northAngle: number = 0): Schedule {
  const { surfaces, openings } = extractSurfaces(model, northAngle);
  const junctions = extractJunctions(model);

  const totals: Totals = {
    externalWallNet: 0,
    window: 0,
    door: 0,
    rooflight: 0,
    roof: 0,
    floor: 0,
    party: 0,
  };

  for (const s of surfaces) {
    if (s.type === "wall" && s.adjacency === "external") totals.externalWallNet += s.area;
    if (s.type === "wall" && s.adjacency === "party") totals.party += s.area;
    if (s.type === "floor") totals.floor += s.area;
    if (s.type === "roof") totals.roof += s.area;
  }

  for (const o of openings) {
    if (o.type === "window") totals.window += o.area;
    if (o.type === "door") totals.door += o.area;
    if (o.type === "rooflight") totals.rooflight += o.area;
  }

  for (const key of Object.keys(totals) as (keyof Totals)[]) {
    totals[key] = Math.round(totals[key] * 1e6) / 1e6;
  }

  return { surfaces, openings, junctions, totals };
}
