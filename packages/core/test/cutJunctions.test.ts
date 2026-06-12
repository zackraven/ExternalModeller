/**
 * WO-B.4 — Junction sanity for cut-roof fixtures.
 *
 * 1. Dual-cut box junctions match parametric dual (already covered in
 *    cutEquivalence.test.ts; re-verified here for explicitness).
 * 2. Mansard knee junctions: the classifier names them "ridge"
 *    (two roof-to-roof edges where the lower 70° slope meets the upper 25°
 *    slope). Record actual behaviour — do not change the classifier.
 */
import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, JunctionRow } from "../src/types.js";
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

/** Sum junction lengths by type. */
function junctionLen(junctions: JunctionRow[], type: string): number {
  return junctions
    .filter((j) => j.type === type)
    .reduce((s, j) => s + j.length, 0);
}

/** Group junction rows by type, sum lengths per type. */
function junctionByType(junctions: JunctionRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const j of junctions) {
    map.set(j.type, (map.get(j.type) ?? 0) + j.length);
  }
  return map;
}

// ── Dual-cut vs parametric dual ─────────────────────────────

describe("Junction sanity — dual-cut vs parametric", () => {
  const parametric: BuildingSpec = {
    masses: [
      {
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
      },
    ],
  };

  const cutBased: BuildingSpec = {
    masses: [
      {
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "cuts",
          cuts: [
            { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
            { id: "north", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
          ],
        },
      },
    ],
  };

  const pSched = solve(parametric);
  const cSched = solve(cutBased);

  it("same junction types", () => {
    const pTypes = [...junctionByType(pSched.junctions).keys()].sort();
    const cTypes = [...junctionByType(cSched.junctions).keys()].sort();
    expect(cTypes).toEqual(pTypes);
  });

  it("eaves lengths match", () => {
    expect(junctionLen(cSched.junctions, "eaves")).toBeCloseTo(
      junctionLen(pSched.junctions, "eaves"),
      4,
    );
  });

  it("ridge lengths match", () => {
    expect(junctionLen(cSched.junctions, "ridge")).toBeCloseTo(
      junctionLen(pSched.junctions, "ridge"),
      4,
    );
  });

  it("gable lengths match", () => {
    expect(junctionLen(cSched.junctions, "gable")).toBeCloseTo(
      junctionLen(pSched.junctions, "gable"),
      4,
    );
  });
});

// ── Mansard knee junctions ──────────────────────────────────
//
// The mansard has 4 roof faces: 2 lower (70°) + 2 upper (25°).
// The 2 knee lines where lower meets upper are each 10m long.
// The classifier sees two roof faces meeting along an edge and
// classifies them as "ridge" — this is the actual behaviour.
//
// Total ridge = top ridge (10m) + south knee (10m) + north knee (10m) = 30m.

describe("Junction sanity — mansard knee classification", () => {
  const schedule = solve(loadFixture("box-mansard"));

  it("knee junctions classified as ridge", () => {
    // If knee lines were classified differently (e.g. "valley"),
    // the ridge total would be only 10m.
    const ridgeTotal = junctionLen(schedule.junctions, "ridge");
    expect(ridgeTotal).toBeCloseTo(30, 0.05);
  });

  it("total ridge = 30m (top 10 + south knee 10 + north knee 10)", () => {
    // All three roof-to-roof edges are classified as "ridge".
    // The junction extractor may consolidate them into one or more rows;
    // we only assert total length.
    const ridgeRows = schedule.junctions.filter((j) => j.type === "ridge");
    expect(ridgeRows.length).toBeGreaterThanOrEqual(1);
    const totalLen = ridgeRows.reduce((s, j) => s + j.length, 0);
    expect(totalLen).toBeCloseTo(30, 0.05);
  });

  it("no valley junctions in mansard", () => {
    // Mansard has no valley lines — all roof-to-roof edges are ridges.
    const valleyLen = junctionLen(schedule.junctions, "valley");
    expect(valleyLen).toBe(0);
  });

  it("eaves = 20m (south + north eaves only)", () => {
    // Only the lower slopes have eaves at wallTopZ, not the upper slopes.
    expect(junctionLen(schedule.junctions, "eaves")).toBeCloseTo(20, 0.05);
  });
});
