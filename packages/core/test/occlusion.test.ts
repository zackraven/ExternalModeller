import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import { resolve } from "../src/resolve/index.js";
import { clipPolygon } from "../src/resolve/occlusion.js";
import type { BuildingSpec, Vec2 } from "../src/types.js";
import { shoelace } from "../src/geometry.js";
import helloBoxSpec from "../fixtures/hello-box.spec.json";
import lPlanSpec from "../fixtures/l-plan.spec.json";
import churchSpec from "../fixtures/church.spec.json";
import twoBoxPartySpec from "../fixtures/two-box-party.spec.json";

// ── clipPolygon unit tests ──────────────────────────────────

describe("clipPolygon", () => {
  /** CCW unit square [0,1]×[0,1] */
  const unitSquare: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];

  it("identical squares → full overlap", () => {
    const result = clipPolygon(unitSquare, unitSquare);
    expect(result.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(shoelace(result))).toBeCloseTo(1, 6);
  });

  it("non-overlapping squares → empty", () => {
    const far: Vec2[] = [[5, 5], [6, 5], [6, 6], [5, 6]];
    const result = clipPolygon(unitSquare, far);
    expect(result.length).toBeLessThan(3);
  });

  it("partial overlap of two rectangles", () => {
    // Second rect shifted right by 0.5
    const shifted: Vec2[] = [[0.5, 0], [1.5, 0], [1.5, 1], [0.5, 1]];
    const result = clipPolygon(unitSquare, shifted);
    expect(result.length).toBeGreaterThanOrEqual(3);
    // Overlap is [0.5,1]×[0,1] = 0.5
    expect(Math.abs(shoelace(result))).toBeCloseTo(0.5, 6);
  });

  it("rectangle clipped by triangle", () => {
    // Rectangle [0,4]×[0,3] CCW
    const rect: Vec2[] = [[0, 0], [4, 0], [4, 3], [0, 3]];
    // Triangle with base [0,4] at y=0, peak at (2,4) — CCW
    const tri: Vec2[] = [[0, 0], [4, 0], [2, 4]];
    const result = clipPolygon(rect, tri);
    expect(result.length).toBeGreaterThanOrEqual(3);
    // At y=3 the triangle spans x=[1.5, 2.5]
    // Intersection is a trapezoid: (0,0),(4,0),(2.5,3),(1.5,3)
    // Area = (4 + 1) * 3 / 2 = 7.5
    expect(Math.abs(shoelace(result))).toBeCloseTo(7.5, 4);
  });

  it("subject fully inside clip → returns subject", () => {
    const small: Vec2[] = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
    const big: Vec2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const result = clipPolygon(small, big);
    expect(Math.abs(shoelace(result))).toBeCloseTo(0.25, 6);
  });

  it("clip fully inside subject → returns clip area", () => {
    const small: Vec2[] = [[0.25, 0.25], [0.75, 0.25], [0.75, 0.75], [0.25, 0.75]];
    const big: Vec2[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    const result = clipPolygon(big, small);
    expect(Math.abs(shoelace(result))).toBeCloseTo(0.25, 6);
  });
});

// ── Church integration ──────────────────────────────────────

describe("Occlusion — church", () => {
  const model = resolve(churchSpec as BuildingSpec);

  function findFace(id: string) {
    return model.faces.find((f) => f.id === id)!;
  }

  it("tower_wall_s0_e1 is fully occluded (area ≈ 20)", () => {
    const face = findFace("tower_wall_s0_e1");
    expect(face).toBeDefined();
    expect(face.occludedArea).toBeCloseTo(20, 1);
  });

  it("tower_wall_s1_e1 is partially occluded by gable (area ≈ 13.4)", () => {
    const face = findFace("tower_wall_s1_e1");
    expect(face).toBeDefined();
    expect(face.occludedArea).toBeDefined();
    expect(face.occludedArea!).toBeGreaterThan(12);
    expect(face.occludedArea!).toBeLessThan(15);
  });

  it("tower_wall_s2_e1 has tiny occlusion from gable peak", () => {
    const face = findFace("tower_wall_s2_e1");
    expect(face).toBeDefined();
    // Very small sliver where gable peak (z≈9.196) overlaps z=[9,13]
    expect(face.occludedArea ?? 0).toBeLessThan(0.2);
    expect(face.occludedArea ?? 0).toBeGreaterThan(0);
  });

  it("nave_wall_s0_e3 occludedArea ≈ 20 (from tower s0 wall)", () => {
    const face = findFace("nave_wall_s0_e3");
    expect(face).toBeDefined();
    expect(face.occludedArea).toBeCloseTo(20, 1);
  });

  it("nave_gable_e3 has occlusion from tower upper walls", () => {
    const face = findFace("nave_gable_e3");
    expect(face).toBeDefined();
    // Occluded by tower_wall_s1_e1 + tower_wall_s2_e1
    expect(face.occludedArea).toBeDefined();
    expect(face.occludedArea!).toBeGreaterThan(12);
    expect(face.occludedArea!).toBeLessThan(15);
  });

  it("schedule net area for fully-occluded tower_wall_s0_e1 is ≈ 0", () => {
    const schedule = solve(churchSpec as BuildingSpec);
    const row = schedule.surfaces.find(
      (s) => s.mass === "tower" && s.name === "Wall S0 E1",
    );
    expect(row).toBeDefined();
    expect(row!.area).toBeCloseTo(0, 0);
  });

  it("non-abutting tower walls have no occlusion", () => {
    // tower edge 0 faces south, edge 2 faces north, edge 3 faces west — none abut the nave
    const s0e0 = findFace("tower_wall_s0_e0");
    const s0e2 = findFace("tower_wall_s0_e2");
    const s0e3 = findFace("tower_wall_s0_e3");
    expect(s0e0.occludedArea).toBeUndefined();
    expect(s0e2.occludedArea).toBeUndefined();
    expect(s0e3.occludedArea).toBeUndefined();
  });
});

// ── Two-box-party: party-tagged faces skip occlusion ────────

describe("Occlusion — two-box-party", () => {
  const model = resolve(twoBoxPartySpec as BuildingSpec);

  it("no face has occludedArea (shared walls are party, not external)", () => {
    for (const face of model.faces) {
      expect(face.occludedArea).toBeUndefined();
    }
  });
});

// ── Single-mass fixtures: no occlusion ──────────────────────

describe("Occlusion — single-mass fixtures unchanged", () => {
  it("hello-box: all occludedArea remain undefined", () => {
    const model = resolve(helloBoxSpec as BuildingSpec);
    for (const face of model.faces) {
      expect(face.occludedArea).toBeUndefined();
    }
  });

  it("l-plan: all occludedArea remain undefined", () => {
    const model = resolve(lPlanSpec as BuildingSpec);
    for (const face of model.faces) {
      expect(face.occludedArea).toBeUndefined();
    }
  });

  it("hello-box schedule totals unchanged", () => {
    const schedule = solve(helloBoxSpec as BuildingSpec);
    expect(schedule.totals.externalWallNet).toBeCloseTo(76.8, 1);
    expect(schedule.totals.floor).toBeCloseTo(60, 1);
  });

  it("l-plan schedule totals unchanged", () => {
    const schedule = solve(lPlanSpec as BuildingSpec);
    expect(schedule.totals.externalWallNet).toBeCloseTo(86.4, 1);
    expect(schedule.totals.floor).toBeCloseTo(56, 1);
  });
});
