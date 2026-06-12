import type { Vec2, BuildingSpec } from "@sap-geometry/core";
import type { DesignState, MassDesign } from "./types";
import { facesFromRidgeGraph } from "./ridgeGraph";
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

/** Build a BuildingSpec from multiple MassDesign objects. */
export function buildSpecFromMasses(masses: MassDesign[]): BuildingSpec {
  const specMasses = masses
    .filter((m) => m.closed && m.vertices.length >= 3)
    .map((m) => {
      let roof: BuildingSpec["masses"][0]["roof"];

      if (m.roofCuts && m.roofCuts.length > 0) {
        // Cut-plane roof
        roof = { type: "cuts", cuts: m.roofCuts };
      } else if (m.ridgeGraph && m.ridgeGraph.nodes.length > 0) {
        // Custom roof from ridge graph
        const wallTopZ = m.storeys.reduce((s, st) => s + st.height, 0);
        const customFaces = facesFromRidgeGraph(m.ridgeGraph, m.vertices, wallTopZ);
        roof = { type: "custom", faces: customFaces };
      } else {
        const roofType = m.roof.type;
        roof = { type: roofType };

        if (roofType !== "flat") {
          roof.pitch = m.roof.pitch;
        }
        if (roofType === "mono" || roofType === "dual") {
          roof.ridgeEdge = Math.min(
            m.roof.ridgeEdge,
            Math.max(0, m.vertices.length - 1),
          );
        }
      }

      const mass: BuildingSpec["masses"][0] = {
        id: m.id,
        footprint: m.vertices,
        storeys: m.storeys,
        roof,
      };
      if (m.openings?.length) mass.openings = m.openings;
      if (m.components?.length) mass.components = m.components;

      return mass;
    });

  return { masses: specMasses };
}
