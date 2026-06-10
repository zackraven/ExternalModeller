import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Schedule, JunctionRow } from "../src/types.js";
import helloBoxWindowSpec from "../fixtures/hello-box-window.spec.json";

const TOL = 0.05;

function junctionLen(schedule: Schedule, type: string): number {
  const j = schedule.junctions.find((j: JunctionRow) => j.type === type);
  return j?.length ?? 0;
}

describe("Phase 3 — hello-box + south window", () => {
  const schedule = solve(helloBoxWindowSpec as BuildingSpec);

  it("window area = 1.44, azimuth 180, tilt 90", () => {
    expect(schedule.openings).toHaveLength(1);
    const win = schedule.openings[0];
    expect(win.type).toBe("window");
    expect(win.area).toBeCloseTo(1.44, 2);
    expect(win.azimuth).toBeCloseTo(180, 1);
    expect(win.tilt).toBeCloseTo(90, 1);
  });

  it("net south wall = 22.56", () => {
    const south = schedule.surfaces.find((s) => s.name === "Wall S0 E0")!;
    expect(south.area).toBeCloseTo(22.56, 2);
  });

  it("net total external wall = 75.36", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(75.36, 2);
  });

  it("window total = 1.44", () => {
    expect(schedule.totals.window).toBeCloseTo(1.44, 2);
  });

  it("opening_head = 1.2", () => {
    expect(junctionLen(schedule, "opening_head")).toBeCloseTo(1.2, TOL);
  });

  it("opening_sill = 1.2", () => {
    expect(junctionLen(schedule, "opening_sill")).toBeCloseTo(1.2, TOL);
  });

  it("opening_jamb = 2.4", () => {
    expect(junctionLen(schedule, "opening_jamb")).toBeCloseTo(2.4, TOL);
  });

  it("existing junctions unchanged: external_corner 9.6, wall_ground_floor 32", () => {
    expect(junctionLen(schedule, "external_corner")).toBeCloseTo(9.6, TOL);
    expect(junctionLen(schedule, "wall_ground_floor")).toBeCloseTo(32, TOL);
  });
});

describe("Phase 3 — door (sill defaults to 0)", () => {
  const spec: BuildingSpec = {
    masses: [
      {
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "flat" },
        openings: [
          { storey: 0, edge: 0, type: "door", width: 0.9, height: 2.1 },
        ],
      },
    ],
  };
  const schedule = solve(spec);

  it("door area = 1.89, azimuth 180, tilt 90", () => {
    expect(schedule.openings).toHaveLength(1);
    const door = schedule.openings[0];
    expect(door.type).toBe("door");
    expect(door.area).toBeCloseTo(1.89, 2);
    expect(door.azimuth).toBeCloseTo(180, 1);
    expect(door.tilt).toBeCloseTo(90, 1);
  });

  it("door total = 1.89", () => {
    expect(schedule.totals.door).toBeCloseTo(1.89, 2);
  });

  it("net south wall = 24 - 1.89 = 22.11", () => {
    const south = schedule.surfaces.find((s) => s.name === "Wall S0 E0")!;
    expect(south.area).toBeCloseTo(22.11, 2);
  });

  it("opening junctions: head 0.9, sill 0.9, jamb 4.2", () => {
    expect(junctionLen(schedule, "opening_head")).toBeCloseTo(0.9, TOL);
    expect(junctionLen(schedule, "opening_sill")).toBeCloseTo(0.9, TOL);
    expect(junctionLen(schedule, "opening_jamb")).toBeCloseTo(4.2, TOL);
  });
});

describe("Phase 3 — multiple openings (count=3)", () => {
  const spec: BuildingSpec = {
    masses: [
      {
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "flat" },
        openings: [
          { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9, count: 3 },
        ],
      },
    ],
  };
  const schedule = solve(spec);

  it("produces 3 window openings", () => {
    expect(schedule.openings).toHaveLength(3);
    for (const win of schedule.openings) {
      expect(win.type).toBe("window");
      expect(win.area).toBeCloseTo(1.44, 2);
      expect(win.azimuth).toBeCloseTo(180, 1);
      expect(win.tilt).toBeCloseTo(90, 1);
    }
  });

  it("window total = 4.32", () => {
    expect(schedule.totals.window).toBeCloseTo(4.32, 2);
  });

  it("net south wall = 24 - 4.32 = 19.68", () => {
    const south = schedule.surfaces.find((s) => s.name === "Wall S0 E0")!;
    expect(south.area).toBeCloseTo(19.68, 2);
  });

  it("opening junctions scale with count: head 3.6, sill 3.6, jamb 7.2", () => {
    expect(junctionLen(schedule, "opening_head")).toBeCloseTo(3.6, TOL);
    expect(junctionLen(schedule, "opening_sill")).toBeCloseTo(3.6, TOL);
    expect(junctionLen(schedule, "opening_jamb")).toBeCloseTo(7.2, TOL);
  });
});

describe("Phase 3 — openings on multiple walls and storeys", () => {
  const spec: BuildingSpec = {
    masses: [
      {
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }, { height: 2.4 }],
        roof: { type: "flat" },
        openings: [
          { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
          { storey: 0, edge: 1, type: "door", width: 0.9, height: 2.1 },
          { storey: 1, edge: 2, type: "window", width: 1.0, height: 1.0, sill: 0.8 },
        ],
      },
    ],
  };
  const schedule = solve(spec);

  it("produces 3 openings total", () => {
    expect(schedule.openings).toHaveLength(3);
  });

  it("storey-1 window on north wall: azimuth 0, tilt 90", () => {
    const northWin = schedule.openings.find(
      (o) => o.host === "mass_0_wall_s1_e2",
    )!;
    expect(northWin.azimuth).toBeCloseTo(0, 1);
    expect(northWin.tilt).toBeCloseTo(90, 1);
    expect(northWin.area).toBeCloseTo(1.0, 2);
  });

  it("east-wall door on storey 0: azimuth 90", () => {
    const eastDoor = schedule.openings.find(
      (o) => o.host === "mass_0_wall_s0_e1",
    )!;
    expect(eastDoor.azimuth).toBeCloseTo(90, 1);
    expect(eastDoor.type).toBe("door");
  });

  it("total window area = 1.44 + 1.0 = 2.44", () => {
    expect(schedule.totals.window).toBeCloseTo(2.44, 2);
  });

  it("total door area = 1.89", () => {
    expect(schedule.totals.door).toBeCloseTo(1.89, 2);
  });
});
