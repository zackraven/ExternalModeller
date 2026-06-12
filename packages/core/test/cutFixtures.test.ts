/**
 * WO-B.3 — Hand-checked validation for cut-roof fixtures.
 *
 * Three fixtures on a standard 10×6 box, 1 storey 2.4m (wallTopZ = 2.4):
 *   box-saltbox:  asymmetric dual — 45° south, 25° north
 *   box-halfhip:  dual 35° with raised-eavesZ hip ends (half-hip)
 *   box-mansard:  steep 70° lower + shallow 25° upper (gambrel profile)
 *
 * All expected values hand-computed below with working shown.
 */
import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");

function loadFixture(name: string) {
  return JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${name}.spec.json`), "utf8"),
  );
}

const TOL = 0.05; // junction/area tolerance

/** Sum junction lengths by type. */
function junctionLen(schedule: ReturnType<typeof solve>, type: string): number {
  return schedule.junctions
    .filter((j) => j.type === type)
    .reduce((s, j) => s + j.length, 0);
}

// ── Box-Saltbox ─────────────────────────────────────────────
//
// 10×6 box, wallTopZ = 2.4.
// South cut: pitch 45° from (0,0)→(10,0), rising toward +y.
// North cut: pitch 25° from (10,6)→(0,6), rising toward -y.
//
// Ridge position:  y*tan(45°) = (6-y)*tan(25°)
//   y = (6-y)*0.46631
//   1.46631y = 2.79786
//   y = 1.9081 (snapped)
//   z_ridge = 2.4 + 1.9081 = 4.3081
//
// South slope area:  10 × 1.9081/cos(45°) = 10 × 2.69846 = 26.985
// North slope area:  10 × 4.0919/cos(25°) = 10 × 4.51492 = 45.149
// Gable triangles:   0.5 × 6 × 1.9081 = 5.7243 each
// Total roof:        26.985 + 45.149 = 72.134
// Total wall (gables): 2 × 5.7243 = 11.449
// Storey walls:      2(24) + 2(14.4) = 76.8
// Wall net total:    76.8 + 11.449 = 88.249

describe("Box-Saltbox — hand-checked", () => {
  const schedule = solve(loadFixture("box-saltbox"));

  it("has 9 surfaces: 4 walls + 2 gables + 1 floor + 2 roof", () => {
    expect(schedule.surfaces).toHaveLength(9);
  });

  it("south slope area ≈ 26.985", () => {
    const south = schedule.surfaces.find(
      (s) => s.type === "roof" && Math.abs(s.tilt - 45) < 1,
    );
    expect(south).toBeDefined();
    expect(south!.area).toBeCloseTo(26.985, 1);
  });

  it("north slope area ≈ 45.149", () => {
    const north = schedule.surfaces.find(
      (s) => s.type === "roof" && Math.abs(s.tilt - 25) < 1,
    );
    expect(north).toBeDefined();
    expect(north!.area).toBeCloseTo(45.149, 1);
  });

  it("two gable walls area ≈ 5.724 each", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.area < 10,
    );
    expect(gables).toHaveLength(2);
    for (const g of gables) expect(g.area).toBeCloseTo(5.724, 1);
  });

  it("total roof ≈ 72.134", () => {
    expect(schedule.totals.roof).toBeCloseTo(72.134, 1);
  });

  it("total external wall net ≈ 88.249", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(88.249, 1);
  });

  it("eaves = 20m (south 10 + north 10)", () => {
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(20, TOL);
  });

  it("ridge = 10m", () => {
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(10, TOL);
  });

  it("gable junctions present", () => {
    // 2 gables × (south slope edge + north slope edge)
    // South edge per gable: sqrt(1.9081² + 1.9081²) = 2.698
    // North edge per gable: sqrt(4.0919² + 1.9081²) = 4.515
    // Total: 2 × (2.698 + 4.515) = 14.427
    expect(junctionLen(schedule, "gable")).toBeCloseTo(14.427, TOL);
  });
});

// ── Box-Halfhip ─────────────────────────────────────────────
//
// 10×6 box, wallTopZ = 2.4.
// South/north cuts: pitch 35° from long edges (standard dual).
// East/west cuts: pitch 35° from short edges, eavesZ = 3.4503.
//   3.4503 = wallTopZ + 0.5 × 3 × tan(35°) = 2.4 + 1.0503 (half gable height)
//
// Ridge height: 2.4 + 3×tan(35°) = 4.5006.
// Hip starts at z=3.4503 at x=10/x=0.
// Hip reaches ridge at x = 10 - 1.0503/tan(35°) = 10 - 1.5 = 8.5
//   (and x = 1.5 on the west side).
//
// Half-hip wall (trapezoid): base=6, top=3 (from y=1.5 to y=4.5), height=1.0503
//   Area = 0.5 × (6+3) × 1.0503 = 4.726 each
//
// All roof faces at pitch 35° so total roof = footprint / cos(35°)
//   = 60 / 0.81915 = 73.246
//
// Ridge: main ridge (1.5,3)→(8.5,3) = 7m, plus 4 hip ridges from
//   (8.5,3)→(10,1.5) and (8.5,3)→(10,4.5) etc.
//   Hip ridge len = sqrt(1.5² + 1.5² + 1.0503²) = sqrt(2.25+2.25+1.1031) = sqrt(5.6031) = 2.367
//   Total ridge: 7 + 4×2.367 = 7 + 9.468 = 16.468

describe("Box-Halfhip — hand-checked", () => {
  const schedule = solve(loadFixture("box-halfhip"));

  it("has 11 surfaces: 4 walls + 2 half-hip walls + 1 floor + 4 roof faces", () => {
    expect(schedule.surfaces).toHaveLength(11);
  });

  it("4 roof faces (2 main slopes + 2 hip triangles)", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(4);
    // All at tilt = 35°
    for (const r of roofs) expect(r.tilt).toBeCloseTo(35, 0.5);
  });

  it("half-hip walls ≈ 4.726 each", () => {
    const walls = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.area < 10,
    );
    expect(walls).toHaveLength(2);
    for (const w of walls) expect(w.area).toBeCloseTo(4.726, 1);
  });

  it("total roof = footprint/cos(35°) ≈ 73.246", () => {
    expect(schedule.totals.roof).toBeCloseTo(73.246, 1);
  });

  it("eaves = 26m (south 10 + north 10 + east 3 + west 3)", () => {
    // The east/west hip eaves: from y=1.5 to y=4.5 at z=3.4503 = 3m each
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(26, TOL);
  });

  it("ridge ≈ 16.47", () => {
    // Main ridge 7m + 4 hip ridges each ≈ 2.367m
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(16.47, TOL);
  });

  it("gable junctions from lower half of gable walls", () => {
    // 2 sides × 2 edges per gable wall × sqrt(1.5² + 1.0503²)
    // = 4 × sqrt(2.25 + 1.1031) = 4 × 1.831 = 7.325
    expect(junctionLen(schedule, "gable")).toBeCloseTo(7.325, TOL);
  });
});

// ── Box-Mansard ─────────────────────────────────────────────
//
// 10×6 box, wallTopZ = 2.4.
// Lower cuts: pitch 70° from south/north edges rising 1m inward.
// Upper cuts: pitch 25° from lines y=1/y=5, eavesZ = 5.1475.
//   5.1475 = 2.4 + 1×tan(70°) = 2.4 + 2.7475 (knee height).
//
// Ridge at y=3: z = 5.1475 + 2×tan(25°) = 5.1475 + 0.9326 = 6.0801.
//
// Lower south slope: 10 × 1/cos(70°) = 10 × 2.9238 = 29.238
// Upper south slope: 10 × 2/cos(25°) = 10 × 2.2067 = 22.067
// Lower north slope: same = 29.238
// Upper north slope: same = 22.067
// Total roof: 2×29.238 + 2×22.067 = 102.611
//
// Gable pentagon area (shoelace in yz plane at x=10):
//   verts: (0,2.4), (6,2.4), (5,5.1475), (3,6.0801), (1,5.1475)
//   Area = 0.5 × |79.128 − 47.923| = 15.603 each
// Total wall net: 76.8 + 2×15.603 = 108.005
//
// Junctions:
//   eaves = 20 (south + north eaves at wallTopZ)
//   ridge = 30 (top ridge 10m + south knee 10m + north knee 10m)
//   gable = per gable: 2×sqrt(1²+2.7475²) + 2×sqrt(2²+0.9326²)
//         = 2×2.9238 + 2×2.2067 = 5.848 + 4.413 = 10.261
//         total = 2×10.261 = 20.522

describe("Box-Mansard — hand-checked", () => {
  const schedule = solve(loadFixture("box-mansard"));

  it("has 11 surfaces: 4 walls + 2 gable pentagons + 1 floor + 4 roof slopes", () => {
    expect(schedule.surfaces).toHaveLength(11);
  });

  it("lower slopes at tilt ≈ 70° with area ≈ 29.238 each", () => {
    const lower = schedule.surfaces.filter(
      (s) => s.type === "roof" && Math.abs(s.tilt - 70) < 1,
    );
    expect(lower).toHaveLength(2);
    for (const r of lower) expect(r.area).toBeCloseTo(29.238, 1);
  });

  it("upper slopes at tilt ≈ 25° with area ≈ 22.067 each", () => {
    const upper = schedule.surfaces.filter(
      (s) => s.type === "roof" && Math.abs(s.tilt - 25) < 1,
    );
    expect(upper).toHaveLength(2);
    for (const r of upper) expect(r.area).toBeCloseTo(22.067, 1);
  });

  it("gable pentagons ≈ 15.603 each", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.area > 15 && s.area < 17,
    );
    expect(gables).toHaveLength(2);
    for (const g of gables) expect(g.area).toBeCloseTo(15.603, 1);
  });

  it("total roof ≈ 102.611", () => {
    expect(schedule.totals.roof).toBeCloseTo(102.611, 1);
  });

  it("total external wall net ≈ 108.005", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(108.005, 1);
  });

  it("eaves = 20m", () => {
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(20, TOL);
  });

  it("ridge = 30m (top ridge + 2 knee lines)", () => {
    // Top ridge 10m + south knee 10m + north knee 10m
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(30, TOL);
  });

  it("gable ≈ 20.522", () => {
    // 2 gable faces × (2 lower edges + 2 upper edges)
    expect(junctionLen(schedule, "gable")).toBeCloseTo(20.522, TOL);
  });
});
