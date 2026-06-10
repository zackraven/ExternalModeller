import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Schedule, JunctionRow } from "../src/types.js";
import twoBoxPartySpec from "../fixtures/two-box-party.spec.json";

const TOL = 0.05;

function junctionLen(schedule: Schedule, type: string): number {
  const j = schedule.junctions.find((j: JunctionRow) => j.type === type);
  return j?.length ?? 0;
}

describe("Phase 6 — two-box party wall", () => {
  const schedule = solve(twoBoxPartySpec as BuildingSpec);

  it("produces 8 wall surfaces total (4 per mass)", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    expect(walls).toHaveLength(8);
  });

  it("2 party walls, each area = 14.4", () => {
    const partyWalls = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.adjacency === "party",
    );
    expect(partyWalls).toHaveLength(2);
    for (const pw of partyWalls) {
      expect(pw.area).toBeCloseTo(14.4, 1);
    }
  });

  it("6 external walls", () => {
    const extWalls = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.adjacency === "external",
    );
    expect(extWalls).toHaveLength(6);
  });

  it("totals.party = 28.8", () => {
    expect(schedule.totals.party).toBeCloseTo(28.8, 1);
  });

  it("totals.externalWallNet = 124.8", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(124.8, 1);
  });

  it("totals.floor = 120", () => {
    expect(schedule.totals.floor).toBeCloseTo(120, 1);
  });

  it("totals.roof = 120", () => {
    expect(schedule.totals.roof).toBeCloseTo(120, 1);
  });

  it("party_wall junction = 16.8", () => {
    expect(junctionLen(schedule, "party_wall")).toBeCloseTo(16.8, TOL);
  });

  it("wall_ground_floor = 64", () => {
    expect(junctionLen(schedule, "wall_ground_floor")).toBeCloseTo(64, TOL);
  });

  it("external_corner = 19.2 (8 corners x 2.4)", () => {
    expect(junctionLen(schedule, "external_corner")).toBeCloseTo(19.2, TOL);
  });
});
