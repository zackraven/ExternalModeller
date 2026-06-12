import type { Vec2, Opening, Component, RoofCut } from "@sap-geometry/core";
import type { RidgeGraph } from "./ridgeGraph";
import { DEFAULT_STOREY_HEIGHT } from "./constants";

export interface RoofConfig {
  type: "flat" | "mono" | "dual" | "hip" | "cuts";
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

// ── Multi-mass types ────────────────────────────

export interface MassDesign {
  id: string;
  name: string;
  vertices: Vec2[];
  closed: boolean;
  storeys: { height: number }[];
  roof: RoofConfig;
  openings?: Opening[];
  components?: Component[];
  ridgeGraph?: RidgeGraph;
  roofCuts?: RoofCut[];
}

export interface StudioState {
  masses: MassDesign[];
  activeMassId: string | null;
  selectedFaceId: string | null;
  showOverlay: boolean;
}

let _massCounter = 0;

export function generateMassId(): string {
  _massCounter++;
  return `mass_${_massCounter}`;
}

export function resetMassCounter(): void {
  _massCounter = 0;
}

export function defaultMass(id?: string): MassDesign {
  const massId = id ?? generateMassId();
  return {
    id: massId,
    name: massId,
    vertices: [],
    closed: false,
    storeys: [{ height: DEFAULT_STOREY_HEIGHT }],
    roof: { type: "flat", pitch: 35, ridgeEdge: 0 },
  };
}

export function defaultStudioState(): StudioState {
  return {
    masses: [],
    activeMassId: null,
    selectedFaceId: null,
    showOverlay: false,
  };
}
