import type { Vec2, BuildingSpec } from "@sap-geometry/core";

/** Extract the first mass's footprint vertices from a BuildingSpec. */
export function verticesFromSpec(spec: BuildingSpec): Vec2[] {
  return spec.masses[0]?.footprint ?? [];
}
