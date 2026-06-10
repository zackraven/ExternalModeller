import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Schedule, JunctionRow } from "../src/types.js";
import helloBoxSpec from "../fixtures/hello-box.spec.json";
import lPlanSpec from "../fixtures/l-plan.spec.json";

const TOL = 0.05;

function junctionLen(schedule: Schedule, type: string): number {
  const j = schedule.junctions.find((j: JunctionRow) => j.type === type);
  return j?.length ?? 0;
}

describe("Phase 1 — hello-box", () => {
  const schedule = solve(helloBoxSpec as BuildingSpec);

  it("produces 4 wall surfaces + 1 floor", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    const floors = schedule.surfaces.filter((s) => s.type === "floor");
    expect(walls).toHaveLength(4);
    expect(floors).toHaveLength(1);
  });

  it("wall areas: south 24, east 14.4, north 24, west 14.4", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    const byEdge = (e: number) => walls.find((w) => w.name === `Wall S0 E${e}`)!;
    expect(byEdge(0).area).toBeCloseTo(24, 1);
    expect(byEdge(1).area).toBeCloseTo(14.4, 1);
    expect(byEdge(2).area).toBeCloseTo(24, 1);
    expect(byEdge(3).area).toBeCloseTo(14.4, 1);
  });

  it("total external wall area = 76.8", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(76.8, 1);
  });

  it("floor area = 60", () => {
    expect(schedule.totals.floor).toBeCloseTo(60, 1);
  });

  it("wall azimuths: S=180, E=90, N=0, W=270", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    const byEdge = (e: number) => walls.find((w) => w.name === `Wall S0 E${e}`)!;
    expect(byEdge(0).azimuth).toBeCloseTo(180, 1);
    expect(byEdge(1).azimuth).toBeCloseTo(90, 1);
    expect(byEdge(2).azimuth).toBeCloseTo(0, 1);
    expect(byEdge(3).azimuth).toBeCloseTo(270, 1);
  });

  it("all walls tilt = 90, floor tilt = 0", () => {
    for (const w of schedule.surfaces.filter((s) => s.type === "wall")) {
      expect(w.tilt).toBeCloseTo(90, 1);
    }
    const floor = schedule.surfaces.find((s) => s.type === "floor")!;
    expect(floor.tilt).toBeCloseTo(0, 1);
  });

  it("external_corner = 9.6, no internal corners", () => {
    expect(junctionLen(schedule, "external_corner")).toBeCloseTo(9.6, TOL);
    expect(junctionLen(schedule, "internal_corner")).toBe(0);
  });

  it("wall_ground_floor = 32", () => {
    expect(junctionLen(schedule, "wall_ground_floor")).toBeCloseTo(32, TOL);
  });
});

describe("Phase 1 — L-plan", () => {
  const schedule = solve(lPlanSpec as BuildingSpec);

  it("produces 6 wall surfaces + 1 floor", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    const floors = schedule.surfaces.filter((s) => s.type === "floor");
    expect(walls).toHaveLength(6);
    expect(floors).toHaveLength(1);
  });

  it("floor area = 56", () => {
    expect(schedule.totals.floor).toBeCloseTo(56, 1);
  });

  it("total external wall area = 86.4 (perimeter 36 × 2.4)", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(86.4, 1);
  });

  it("external_corner = 12 (5 convex × 2.4)", () => {
    expect(junctionLen(schedule, "external_corner")).toBeCloseTo(12, TOL);
  });

  it("internal_corner = 2.4 (1 concave × 2.4)", () => {
    expect(junctionLen(schedule, "internal_corner")).toBeCloseTo(2.4, TOL);
  });

  it("wall_ground_floor = 36", () => {
    expect(junctionLen(schedule, "wall_ground_floor")).toBeCloseTo(36, TOL);
  });

  it("wall azimuths match footprint edge normals", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    const byEdge = (e: number) => walls.find((w) => w.name === `Wall S0 E${e}`)!;
    expect(byEdge(0).azimuth).toBeCloseTo(180, 1); // south
    expect(byEdge(1).azimuth).toBeCloseTo(90, 1);  // east
    expect(byEdge(2).azimuth).toBeCloseTo(0, 1);   // north
    expect(byEdge(3).azimuth).toBeCloseTo(90, 1);  // east (step)
    expect(byEdge(4).azimuth).toBeCloseTo(0, 1);   // north
    expect(byEdge(5).azimuth).toBeCloseTo(270, 1);  // west
  });
});
