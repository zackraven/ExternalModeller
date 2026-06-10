// ── Primitives ──────────────────────────────────────────────

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

// ── BuildingSpec (input) ────────────────────────────────────

export interface BuildingSpec {
  meta?: { units?: "m"; northAngle?: number };
  masses: Mass[];
}

export interface Mass {
  id?: string;
  footprint: Vec2[];
  storeys: Storey[];
  roof?: Roof;
  openings?: Opening[];
  components?: Component[];
  adjacency?: EdgeAdjacency[];
  floorAdjacency?: "ground" | "exposed" | "unheated";
}

export interface Storey {
  height: number;
}

export interface Roof {
  type: "flat" | "mono" | "dual" | "hip" | "none";
  pitch?: number;
  ridgeEdge?: number;
}

export interface Opening {
  storey: number;
  edge: number;
  type: "window" | "door" | "rooflight";
  width: number;
  height: number;
  sill?: number;
  count?: number;
}

export interface Component {
  kind: "dormer" | "rooflight";
  roofPlane: number;
  shape?: "gable" | "hip" | "flat";
  width: number;
  height: number;
  projection?: number;
  window?: { width: number; height: number };
}

export interface EdgeAdjacency {
  storey: number;
  edge: number;
  type: "external" | "party" | "internal" | "unheated";
}

// ── FaceModel (internal) ────────────────────────────────────

export interface Face {
  id: string;
  vertices: Vec3[];
  normal: Vec3;
  area: number;
  tag: FaceTag;
  openings: FaceOpening[];
  occludedArea?: number;  // area hidden behind another mass's surface
}

export interface FaceTag {
  mass: string;
  storey: number;
  type: "wall" | "floor" | "roof" | "dormer_front" | "dormer_cheek" | "dormer_roof";
  adjacency: "external" | "party" | "internal" | "unheated" | "ground" | "exposed";
  edge?: number;
}

export interface FaceOpening {
  id: string;
  vertices: Vec3[];
  area: number;
  type: "window" | "door" | "rooflight";
}

export interface HalfEdge {
  from: Vec3;
  to: Vec3;
  face: string;
  twin?: string; // face id of the twin half-edge
}

export interface FaceModel {
  faces: Face[];
  edges: HalfEdge[];
}

// ── Schedule (output) ───────────────────────────────────────

export interface Schedule {
  surfaces: SurfaceRow[];
  openings: OpeningRow[];
  junctions: JunctionRow[];
  totals: Totals;
}

export interface SurfaceRow {
  name: string;
  mass: string;
  storey: number;
  type: string;
  adjacency: string;
  area: number;
  azimuth: number;
  tilt: number;
}

export interface OpeningRow {
  name: string;
  host: string;
  type: string;
  area: number;
  azimuth: number;
  tilt: number;
}

export interface JunctionRow {
  type: string;
  length: number;
  instances?: number;
}

export interface Totals {
  externalWallNet: number;
  window: number;
  door: number;
  rooflight: number;
  roof: number;
  floor: number;
  party: number;
}
