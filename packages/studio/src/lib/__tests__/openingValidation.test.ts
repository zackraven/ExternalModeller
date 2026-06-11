import { describe, it, expect } from "vitest";
import { validateOpening } from "../openingValidation";
import type { MassDesign } from "../types";
import type { Opening } from "@sap-geometry/core";

// 10×6 box, 1 storey 2.4m
const BOX: MassDesign = {
  id: "test",
  name: "test",
  vertices: [[0, 0], [10, 0], [10, 6], [0, 6]],
  closed: true,
  storeys: [{ height: 2.4 }],
  roof: { type: "flat", pitch: 35, ridgeEdge: 0 },
};

describe("validateOpening", () => {
  it("accepts a valid window", () => {
    const o: Opening = { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 };
    expect(validateOpening(o, BOX)).toEqual({ valid: true });
  });

  it("accepts a valid door", () => {
    const o: Opening = { storey: 0, edge: 1, type: "door", width: 0.9, height: 2.1 };
    expect(validateOpening(o, BOX)).toEqual({ valid: true });
  });

  it("rejects width exceeding wall length", () => {
    const o: Opening = { storey: 0, edge: 1, type: "window", width: 7.0, height: 1.0, sill: 0.5 };
    const result = validateOpening(o, BOX);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds wall length");
  });

  it("rejects height + sill exceeding storey height", () => {
    const o: Opening = { storey: 0, edge: 0, type: "window", width: 1.0, height: 2.0, sill: 1.0 };
    const result = validateOpening(o, BOX);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds storey height");
  });

  it("rejects invalid edge index", () => {
    const o: Opening = { storey: 0, edge: 5, type: "window", width: 1.0, height: 1.0, sill: 0.5 };
    const result = validateOpening(o, BOX);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Edge 5 does not exist");
  });

  it("rejects invalid storey index", () => {
    const o: Opening = { storey: 2, edge: 0, type: "window", width: 1.0, height: 1.0, sill: 0.5 };
    const result = validateOpening(o, BOX);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Storey 2 does not exist");
  });

  it("rejects negative dimensions", () => {
    const o: Opening = { storey: 0, edge: 0, type: "window", width: -1, height: 1.0, sill: 0.5 };
    expect(validateOpening(o, BOX).valid).toBe(false);
  });

  it("accepts count > 1 that fits", () => {
    const o: Opening = { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9, count: 3 };
    expect(validateOpening(o, BOX)).toEqual({ valid: true });
  });

  it("rejects count > 1 that doesn't fit", () => {
    const o: Opening = { storey: 0, edge: 1, type: "window", width: 2.0, height: 1.0, sill: 0.5, count: 4 };
    const result = validateOpening(o, BOX);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("exceeds wall length");
  });
});
