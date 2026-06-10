import type { BuildingSpec, Schedule } from "./types.js";
import { resolve } from "./resolve/index.js";
import { extract } from "./extract/index.js";

export function solve(spec: BuildingSpec): Schedule {
  const model = resolve(spec);
  const northAngle = spec.meta?.northAngle ?? 0;
  return extract(model, northAngle);
}
