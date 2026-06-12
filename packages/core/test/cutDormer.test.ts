/**
 * WO-B.5 — Dormer/rooflight placement on cut-roof faces.
 *
 * Places a rooflight on the mansard lower slope (roof plane 0, 70°)
 * via the component spec. Verifies placement succeeds and the rooflight
 * appears in the schedule output.
 */
import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec } from "../src/types.js";

// Mansard with a rooflight on the south lower slope (roofPlane 0).
const mansardWithRooflight: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "south-lo", a: [0, 0], b: [10, 0], side: "left", pitch: 70 },
          { id: "north-lo", a: [10, 6], b: [0, 6], side: "left", pitch: 70 },
          { id: "south-hi", a: [0, 1], b: [10, 1], side: "left", pitch: 25, eavesZ: 5.1475 },
          { id: "north-hi", a: [10, 5], b: [0, 5], side: "left", pitch: 25, eavesZ: 5.1475 },
        ],
      },
      components: [
        {
          kind: "rooflight",
          roofPlane: 0,
          width: 0.8,
          height: 1.2,
        },
      ],
    },
  ],
};

describe("Rooflight on cut-roof mansard lower slope", () => {
  const schedule = solve(mansardWithRooflight);

  it("schedule has rooflight in totals", () => {
    expect(schedule.totals.rooflight).toBeGreaterThan(0);
  });

  it("rooflight area ≈ 0.96 (0.8 × 1.2)", () => {
    expect(schedule.totals.rooflight).toBeCloseTo(0.96, 2);
  });

  it("rooflight appears in openings list", () => {
    const rooflights = schedule.openings.filter(
      (o) => o.type === "rooflight",
    );
    expect(rooflights).toHaveLength(1);
    expect(rooflights[0].area).toBeCloseTo(0.96, 2);
  });

  it("south lower slope net area reduced by rooflight", () => {
    // Gross area ≈ 29.238, net should be gross - 0.96 ≈ 28.278
    const roofSurfaces = schedule.surfaces.filter(
      (s) => s.type === "roof" && Math.abs(s.tilt - 70) < 1,
    );
    // One of the two 70° slopes should have reduced net area
    const netAreas = roofSurfaces.map((s) => s.area);
    const minNet = Math.min(...netAreas);
    expect(minNet).toBeCloseTo(29.238 - 0.96, 0);
  });

  it("all 11 surfaces still present", () => {
    expect(schedule.surfaces).toHaveLength(11);
  });
});
