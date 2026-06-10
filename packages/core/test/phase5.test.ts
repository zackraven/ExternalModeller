import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Schedule } from "../src/types.js";
import helloBoxDualDormerSpec from "../fixtures/hello-box-dual-dormer.spec.json";

const TOL = 0.05;

// Precomputed values for 35° pitch, width=2, height=1.5:
// projection = height / tan(35°) = 1.5 / 0.70021 = 2.1424 m
// vHole = projection / cos(35°) = 2.6144
// footprint on tilted roof = 2 × 2.6144 = 5.229
// host roof P0 original ≈ 36.62, net ≈ 36.62 − 5.23 = 31.39
// dormer roof: flat at ridgeZ, width × projection = 2 × 2.14 = 4.28, tilt ≈ 0°
// cheeks: right triangles, each = height × projection / 2 = 1.5 × 2.14 / 2 = 1.607

describe("Phase 5 — dormer on dual-pitch south plane", () => {
  const schedule = solve(helloBoxDualDormerSpec as BuildingSpec);

  it("host roof plane 0 net area ≈ 31.39", () => {
    const roof0 = schedule.surfaces.find(
      (s) => s.type === "roof" && s.name === "Roof P0",
    )!;
    expect(roof0.area).toBeCloseTo(31.39, 0);
  });

  it("host roof plane 1 unaffected ≈ 36.62", () => {
    const roof1 = schedule.surfaces.find(
      (s) => s.type === "roof" && s.name === "Roof P1",
    )!;
    expect(roof1.area).toBeCloseTo(36.62, 0);
  });

  it("dormer front: tilt 90°, azimuth 180°, name", () => {
    const front = schedule.surfaces.find(
      (s) => s.type === "dormer_front",
    )!;
    expect(front.tilt).toBeCloseTo(90, 1);
    expect(front.azimuth).toBeCloseTo(180, 1);
    expect(front.name).toBe("Dormer 0 Front");
  });

  it("dormer front gross area = net + window = 1.8 + 1.2 = 3.0", () => {
    const front = schedule.surfaces.find(
      (s) => s.type === "dormer_front",
    )!;
    const win = schedule.openings.find(
      (o) => o.name.includes("dormer") && o.type === "window",
    )!;
    expect(front.area + win.area).toBeCloseTo(3.0, 1);
  });

  it("dormer roof: flat, tilt ≈ 0°, area ≈ 4.28", () => {
    const roof = schedule.surfaces.find(
      (s) => s.type === "dormer_roof",
    )!;
    expect(roof.tilt).toBeCloseTo(0, 1);
    expect(roof.area).toBeCloseTo(4.28, 1);
    expect(roof.name).toBe("Dormer 0 Roof");
  });

  it("2 dormer cheeks (triangles), each area ≈ 1.61", () => {
    const cheeks = schedule.surfaces.filter(
      (s) => s.type === "dormer_cheek",
    );
    expect(cheeks).toHaveLength(2);
    for (const c of cheeks) {
      expect(c.area).toBeCloseTo(1.61, 1);
      expect(c.name).toBe("Dormer 0 Cheek");
    }
  });

  it("dormer window: area 1.2, tilt 90°, azimuth 180°", () => {
    const wins = schedule.openings.filter(
      (o) => o.name.includes("dormer") && o.type === "window",
    );
    expect(wins).toHaveLength(1);
    expect(wins[0].area).toBeCloseTo(1.2, 2);
    expect(wins[0].tilt).toBeCloseTo(90, 1);
    expect(wins[0].azimuth).toBeCloseTo(180, 1);
  });

  it("dormer front net = 3.0 − 1.2 = 1.8", () => {
    const front = schedule.surfaces.find(
      (s) => s.type === "dormer_front",
    )!;
    expect(front.area).toBeCloseTo(1.8, 1);
  });

  it("roof total includes dormer roof", () => {
    // 31.39 (host P0) + 36.62 (P1) + 4.28 (dormer roof) ≈ 72.30
    expect(schedule.totals.roof).toBeCloseTo(72.30, 0);
  });

  it("window total includes dormer window", () => {
    expect(schedule.totals.window).toBeCloseTo(1.2, 2);
  });
});

describe("Phase 5 — rooflight on dual-pitch", () => {
  const spec: BuildingSpec = {
    masses: [
      {
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
        components: [
          {
            kind: "rooflight",
            roofPlane: 0,
            width: 1.2,
            height: 0.8,
          },
        ],
      },
    ],
  };
  const schedule = solve(spec);

  it("rooflight opening area = 0.96, type rooflight", () => {
    const rl = schedule.openings.find((o) => o.type === "rooflight")!;
    expect(rl).toBeDefined();
    expect(rl.area).toBeCloseTo(0.96, 2);
    expect(rl.type).toBe("rooflight");
  });

  it("rooflight tilt = 35°, azimuth = 180°", () => {
    const rl = schedule.openings.find((o) => o.type === "rooflight")!;
    expect(rl.tilt).toBeCloseTo(35, 1);
    expect(rl.azimuth).toBeCloseTo(180, 1);
  });

  it("host roof net area = 36.62 − 0.96 ≈ 35.66", () => {
    const roof0 = schedule.surfaces.find(
      (s) => s.type === "roof" && s.name === "Roof P0",
    )!;
    expect(roof0.area).toBeCloseTo(35.66, 0);
  });

  it("rooflight total = 0.96", () => {
    expect(schedule.totals.rooflight).toBeCloseTo(0.96, 2);
  });
});
