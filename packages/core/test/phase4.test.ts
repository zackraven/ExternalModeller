import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Schedule, JunctionRow } from "../src/types.js";
import helloBoxSpec from "../fixtures/hello-box.spec.json";
import helloBoxDualSpec from "../fixtures/hello-box-dual.spec.json";
import helloBoxHipSpec from "../fixtures/hello-box-hip.spec.json";

const TOL = 0.05;

function junctionLen(schedule: Schedule, type: string): number {
  const j = schedule.junctions.find((j: JunctionRow) => j.type === type);
  return j?.length ?? 0;
}

describe("Phase 4 — flat roof (hello-box)", () => {
  const schedule = solve(helloBoxSpec as BuildingSpec);

  it("produces 1 roof plane", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(1);
  });

  it("roof area = 60", () => {
    const roof = schedule.surfaces.find((s) => s.type === "roof")!;
    expect(roof.area).toBeCloseTo(60, 1);
  });

  it("roof tilt = 0", () => {
    const roof = schedule.surfaces.find((s) => s.type === "roof")!;
    expect(roof.tilt).toBeCloseTo(0, 1);
  });

  it("roof_flat_wall junction length = 32 (full perimeter)", () => {
    expect(junctionLen(schedule, "roof_flat_wall")).toBeCloseTo(32, TOL);
  });

  it("roof total = 60", () => {
    expect(schedule.totals.roof).toBeCloseTo(60, 1);
  });
});

describe("Phase 4 — dual-pitch roof", () => {
  const schedule = solve(helloBoxDualSpec as BuildingSpec);

  it("produces 2 roof planes", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("each roof plane area ≈ 36.62", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.area).toBeCloseTo(36.62, 1);
    }
  });

  it("both roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("roof azimuths: 180° and 0°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const azimuths = roofs.map((r) => r.azimuth).sort((a, b) => a - b);
    expect(azimuths[0]).toBeCloseTo(0, 1);
    expect(azimuths[1]).toBeCloseTo(180, 1);
  });

  it("produces 2 gable walls", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(2);
  });

  it("each gable wall area ≈ 6.30", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    for (const g of gables) {
      expect(g.area).toBeCloseTo(6.30, 1);
    }
  });

  it("eaves length = 20 (2 × 10)", () => {
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(20, TOL);
  });

  it("gable junction length ≈ 14.65 (4 × 3.662)", () => {
    expect(junctionLen(schedule, "gable")).toBeCloseTo(14.65, TOL);
  });

  it("ridge length = 10", () => {
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(10, TOL);
  });
});

describe("Phase 4 — hip roof", () => {
  const schedule = solve(helloBoxHipSpec as BuildingSpec);

  it("produces 4 roof planes", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(4);
  });

  it("all roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("sum of plan-projected areas = 60 (footprint area)", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    expect(projectedSum).toBeCloseTo(60, 1);
  });

  it("eaves length = 32 (full perimeter)", () => {
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(32, TOL);
  });

  it("ridge length ≈ 22.94 (central ridge + 4 hip edges)", () => {
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(22.94, TOL);
  });

  it("no gable junctions", () => {
    expect(junctionLen(schedule, "gable")).toBe(0);
  });

  it("no gable wall surfaces", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(0);
  });
});
