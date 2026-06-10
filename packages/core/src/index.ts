// ── Public API ─────────────────────────────────────────────
export { resolve } from "./resolve/index.js";
export { solve } from "./solve.js";
export { extract } from "./extract/index.js";
export { azimuthOf, tiltOf } from "./geometry.js";

// ── Types ──────────────────────────────────────────────────
export type {
  Vec2,
  Vec3,
  BuildingSpec,
  Mass,
  Storey,
  Roof,
  Opening,
  Component,
  EdgeAdjacency,
  Face,
  FaceTag,
  FaceOpening,
  HalfEdge,
  FaceModel,
  Schedule,
  SurfaceRow,
  OpeningRow,
  JunctionRow,
  Totals,
} from "./types.js";
