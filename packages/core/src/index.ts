// ── Public API ─────────────────────────────────────────────
export { resolve } from "./resolve/index.js";
export { solve } from "./solve.js";
export { extract } from "./extract/index.js";
export { azimuthOf, tiltOf } from "./geometry.js";
export { surfacesCsv, openingsCsv, junctionsCsv, totalsCsv, scheduleCsv } from "./csv.js";
export { suggestRoof } from "./resolve/suggest.js";
export { validateCustomRoof } from "./resolve/validateCustomRoof.js";

// ── Types ──────────────────────────────────────────────────
export type {
  Vec2,
  Vec3,
  BuildingSpec,
  Mass,
  Storey,
  Roof,
  CustomRoofFace,
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
export type { RoofValidationError } from "./resolve/validateCustomRoof.js";
