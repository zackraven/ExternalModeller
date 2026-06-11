import type { Opening, Component } from "@sap-geometry/core";
import { DEFAULT_STOREY_HEIGHT } from "./constants";

export interface RoofConfig {
  type: "flat" | "mono" | "dual" | "hip";
  pitch: number;
  ridgeEdge: number;
}

export interface DesignState {
  storeys: { height: number }[];
  roof: RoofConfig;
  openings?: Opening[];
  components?: Component[];
}

export function defaultDesign(): DesignState {
  return {
    storeys: [{ height: DEFAULT_STOREY_HEIGHT }],
    roof: { type: "flat", pitch: 35, ridgeEdge: 0 },
  };
}
