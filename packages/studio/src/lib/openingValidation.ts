import type { Opening } from "@sap-geometry/core";
import type { MassDesign } from "./types";

export interface OpeningValidation {
  valid: boolean;
  error?: string;
}

export function validateOpening(
  opening: Opening,
  mass: MassDesign,
): OpeningValidation {
  const { storey, edge, width, height, count } = opening;
  const sill = opening.sill ?? (opening.type === "door" ? 0 : 0.9);
  const n = count ?? 1;

  if (storey < 0 || storey >= mass.storeys.length) {
    return { valid: false, error: `Storey ${storey} does not exist (mass has ${mass.storeys.length})` };
  }

  if (edge < 0 || edge >= mass.vertices.length) {
    return { valid: false, error: `Edge ${edge} does not exist (mass has ${mass.vertices.length} edges)` };
  }

  if (width <= 0) {
    return { valid: false, error: "Width must be positive" };
  }

  if (height <= 0) {
    return { valid: false, error: "Height must be positive" };
  }

  const storeyHeight = mass.storeys[storey].height;
  if (sill + height > storeyHeight) {
    return {
      valid: false,
      error: `Sill (${sill.toFixed(2)}) + height (${height.toFixed(2)}) = ${(sill + height).toFixed(2)}m exceeds storey height (${storeyHeight.toFixed(2)}m)`,
    };
  }

  const a = mass.vertices[edge];
  const b = mass.vertices[(edge + 1) % mass.vertices.length];
  const wallLen = Math.hypot(b[0] - a[0], b[1] - a[1]);

  if (width * n > wallLen) {
    return {
      valid: false,
      error: `Total opening width (${(width * n).toFixed(2)}m) exceeds wall length (${wallLen.toFixed(2)}m)`,
    };
  }

  return { valid: true };
}
