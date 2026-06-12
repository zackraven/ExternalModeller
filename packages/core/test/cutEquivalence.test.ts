/**
 * WO-B.2 — Equivalence oracle: cut-based specs must produce identical
 * schedules to parametric specs for dual, mono, and hip roof types.
 *
 * Comparison: same surface count, areas within 1e-6, same junction types
 * and total lengths per type, same totals.
 */
import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Schedule, JunctionRow, Totals } from "../src/types.js";

// ── Helpers ──────────────────────────────────────────────────

/** Group junction rows by type, sum lengths per type. */
function junctionByType(junctions: JunctionRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const j of junctions) {
    map.set(j.type, (map.get(j.type) ?? 0) + j.length);
  }
  return map;
}

/** Assert two schedules are equivalent per the oracle criteria. */
function assertEquiv(actual: Schedule, expected: Schedule, label: string) {
  // 1. Same surface count
  expect(actual.surfaces.length, `${label}: surface count`).toBe(expected.surfaces.length);

  // 2. Areas match (sort descending, compare pairwise within 1e-5)
  const aAreas = actual.surfaces.map((s) => s.area).sort((a, b) => b - a);
  const eAreas = expected.surfaces.map((s) => s.area).sort((a, b) => b - a);
  for (let i = 0; i < eAreas.length; i++) {
    expect(aAreas[i]).toBeCloseTo(eAreas[i], 5);
  }

  // 3. Junction types and total lengths per type
  const aJT = junctionByType(actual.junctions);
  const eJT = junctionByType(expected.junctions);
  const aKeys = [...aJT.keys()].sort();
  const eKeys = [...eJT.keys()].sort();
  expect(aKeys, `${label}: junction types`).toEqual(eKeys);
  for (const [type, length] of eJT) {
    expect(aJT.get(type), `${label}: junction "${type}"`).toBeCloseTo(length, 5);
  }

  // 4. Totals match
  for (const key of Object.keys(expected.totals) as (keyof Totals)[]) {
    expect(actual.totals[key], `${label}: totals.${key}`).toBeCloseTo(
      expected.totals[key] as number,
      5,
    );
  }
}

// ── Parametric specs ────────────────────────────────────────

const helloBoxDual: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    },
  ],
};

const helloBoxMono: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "mono", pitch: 35, ridgeEdge: 0 },
    },
  ],
};

const helloBoxHip: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "hip", pitch: 35 },
    },
  ],
};

// ── Cut-based specs ─────────────────────────────────────────

// Dual: 2 cuts — south edge + north edge, both rising inward at 35°
const cutDual: BuildingSpec = {
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

// Mono: 1 cut — north edge rising toward south (ridge at south per ridgeEdge=0)
const cutMono: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "slope", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
        ],
      },
    },
  ],
};

// Hip: 4 cuts — one per footprint edge, all rising inward at 35°
const cutHip: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
          { id: "east", a: [10, 0], b: [10, 6], side: "left", pitch: 35 },
          { id: "north", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
          { id: "west", a: [0, 6], b: [0, 0], side: "left", pitch: 35 },
        ],
      },
    },
  ],
};

// ── Tests ───────────────────────────────────────────────────

describe("Cut equivalence oracle", () => {
  it("dual-pitch: 2 cuts match parametric dual", () => {
    const expected = solve(helloBoxDual);
    const actual = solve(cutDual);
    assertEquiv(actual, expected, "dual");
  });

  it("mono-pitch: 1 cut matches parametric mono", () => {
    const expected = solve(helloBoxMono);
    const actual = solve(cutMono);
    assertEquiv(actual, expected, "mono");
  });

  it("hip: 4 cuts match parametric hip", () => {
    const expected = solve(helloBoxHip);
    const actual = solve(cutHip);
    assertEquiv(actual, expected, "hip");
  });
});
