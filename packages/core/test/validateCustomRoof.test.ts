import { describe, it, expect } from "vitest";
import { validateCustomRoof } from "../src/resolve/validateCustomRoof.js";
import type { CustomRoofFace, Vec2, Vec3 } from "../src/types.js";

const footprint: Vec2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
const wallTopZ = 2.4;
const tan35 = Math.tan(35 * Math.PI / 180);
const ridgeZ = wallTopZ + 3 * tan35;

const validDualFaces: CustomRoofFace[] = [
  {
    polygon: [
      [0, 0, wallTopZ], [10, 0, wallTopZ], [10, 3, ridgeZ], [0, 3, ridgeZ],
    ] as Vec3[],
  },
  {
    polygon: [
      [10, 6, wallTopZ], [0, 6, wallTopZ], [0, 3, ridgeZ], [10, 3, ridgeZ],
    ] as Vec3[],
  },
];

describe("validateCustomRoof", () => {
  it("accepts valid dual-pitch faces", () => {
    const errors = validateCustomRoof(validDualFaces, footprint, wallTopZ);
    const realErrors = errors.filter(e => e.severity === "error");
    expect(realErrors).toHaveLength(0);
  });

  it("rejects vertex below wallTopZ", () => {
    const badFaces: CustomRoofFace[] = [
      {
        polygon: [
          [0, 0, wallTopZ - 1], [10, 0, wallTopZ], [10, 3, ridgeZ], [0, 3, ridgeZ],
        ] as Vec3[],
      },
    ];
    const errors = validateCustomRoof(badFaces, footprint, wallTopZ);
    expect(errors.some(e => e.severity === "error" && e.message.includes("below wallTopZ"))).toBe(true);
  });

  it("rejects non-planar face (twisted quad)", () => {
    const twistedFaces: CustomRoofFace[] = [
      {
        polygon: [
          [0, 0, wallTopZ],
          [10, 0, wallTopZ],
          [10, 6, wallTopZ + 2],
          [0, 6, wallTopZ],  // This vertex breaks planarity
        ] as Vec3[],
      },
    ];
    const errors = validateCustomRoof(twistedFaces, footprint, wallTopZ);
    expect(errors.some(e => e.severity === "error" && e.message.includes("from the face plane"))).toBe(true);
  });

  it("warns on plan coverage gap", () => {
    // Only cover half the footprint
    const halfFaces: CustomRoofFace[] = [
      {
        polygon: [
          [0, 0, wallTopZ], [5, 0, wallTopZ], [5, 6, wallTopZ], [0, 6, wallTopZ],
        ] as Vec3[],
      },
    ];
    const errors = validateCustomRoof(halfFaces, footprint, wallTopZ);
    expect(errors.some(e => e.severity === "warning" && e.message.includes("uncovered"))).toBe(true);
  });

  it("rejects degenerate zero-area face", () => {
    const degenFaces: CustomRoofFace[] = [
      {
        polygon: [
          [0, 0, wallTopZ], [10, 0, wallTopZ], [5, 0, wallTopZ],
        ] as Vec3[],
      },
    ];
    const errors = validateCustomRoof(degenFaces, footprint, wallTopZ);
    expect(errors.some(e => e.severity === "error" && e.message.includes("zero"))).toBe(true);
  });

  it("rejects face with fewer than 3 vertices", () => {
    const tooFew: CustomRoofFace[] = [
      {
        polygon: [[0, 0, wallTopZ], [10, 0, wallTopZ]] as Vec3[],
      },
    ];
    const errors = validateCustomRoof(tooFew, footprint, wallTopZ);
    expect(errors.some(e => e.severity === "error" && e.message.includes("fewer than 3"))).toBe(true);
  });
});
