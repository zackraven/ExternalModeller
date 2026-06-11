import type { Vec2, BuildingSpec } from "@sap-geometry/core";
import type { DesignState } from "./types";
import { DEFAULT_STOREY_HEIGHT } from "./constants";

/** Build a minimal BuildingSpec from a closed polygon of vertices. */
export function specFromVertices(vertices: Vec2[]): BuildingSpec {
  return buildSpec(vertices, {
    storeys: [{ height: DEFAULT_STOREY_HEIGHT }],
    roof: { type: "flat", pitch: 35, ridgeEdge: 0 },
  });
}

/** Build a BuildingSpec from vertices and design state. */
export function buildSpec(vertices: Vec2[], design: DesignState): BuildingSpec {
  const roofType = design.roof.type;
  const roof: BuildingSpec["masses"][0]["roof"] = { type: roofType };

  if (roofType !== "flat") {
    roof.pitch = design.roof.pitch;
  }
  if (roofType === "mono" || roofType === "dual") {
    roof.ridgeEdge = Math.min(design.roof.ridgeEdge, Math.max(0, vertices.length - 1));
  }

  const mass: BuildingSpec["masses"][0] = {
    footprint: vertices,
    storeys: design.storeys,
    roof,
  };
  if (design.openings?.length) mass.openings = design.openings;
  if (design.components?.length) mass.components = design.components;

  return { masses: [mass] };
}
