import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import {
  surfacesCsv,
  openingsCsv,
  junctionsCsv,
  totalsCsv,
  scheduleCsv,
} from "../src/csv.js";
import type { BuildingSpec } from "../src/types.js";

import helloBoxSpec from "../fixtures/hello-box.spec.json";
import helloBoxWindowSpec from "../fixtures/hello-box-window.spec.json";

const helloBox = solve(helloBoxSpec as BuildingSpec);
const helloBoxWindow = solve(helloBoxWindowSpec as BuildingSpec);

// ── surfacesCsv ──────────────────────────────────────────────

describe("surfacesCsv", () => {
  const csv = surfacesCsv(helloBox.surfaces);
  const lines = csv.trimEnd().split("\n");

  it("has correct header", () => {
    expect(lines[0]).toBe("name,mass,storey,type,adjacency,area,azimuth,tilt");
  });

  it("row count matches surfaces length", () => {
    expect(lines.length - 1).toBe(helloBox.surfaces.length);
  });

  it("row values match schedule data", () => {
    const first = helloBox.surfaces[0];
    expect(lines[1]).toBe(
      `${first.name},${first.mass},${first.storey},${first.type},${first.adjacency},${first.area},${first.azimuth},${first.tilt}`,
    );
  });
});

// ── openingsCsv ──────────────────────────────────────────────

describe("openingsCsv", () => {
  const csv = openingsCsv(helloBoxWindow.openings);
  const lines = csv.trimEnd().split("\n");

  it("has correct header", () => {
    expect(lines[0]).toBe("name,host,type,area,azimuth,tilt");
  });

  it("row count matches openings length", () => {
    expect(lines.length - 1).toBe(helloBoxWindow.openings.length);
  });

  it("row values match schedule data", () => {
    const first = helloBoxWindow.openings[0];
    expect(lines[1]).toBe(
      `${first.name},${first.host},${first.type},${first.area},${first.azimuth},${first.tilt}`,
    );
  });
});

describe("openingsCsv — no openings", () => {
  const csv = openingsCsv(helloBox.openings);
  const lines = csv.trimEnd().split("\n");

  it("only header when no openings", () => {
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe("name,host,type,area,azimuth,tilt");
  });
});

// ── junctionsCsv ─────────────────────────────────────────────

describe("junctionsCsv", () => {
  const csv = junctionsCsv(helloBox.junctions);
  const lines = csv.trimEnd().split("\n");

  it("has correct header", () => {
    expect(lines[0]).toBe("type,length,instances");
  });

  it("row count matches junctions length", () => {
    expect(lines.length - 1).toBe(helloBox.junctions.length);
  });

  it("row values match schedule data", () => {
    const first = helloBox.junctions[0];
    const expectedInstances = first.instances ?? "";
    expect(lines[1]).toBe(
      `${first.type},${first.length},${expectedInstances}`,
    );
  });
});

// ── totalsCsv ────────────────────────────────────────────────

describe("totalsCsv", () => {
  const csv = totalsCsv(helloBox.totals);
  const lines = csv.trimEnd().split("\n");

  it("has correct header", () => {
    expect(lines[0]).toBe("metric,value");
  });

  it("row count matches totals keys", () => {
    expect(lines.length - 1).toBe(Object.keys(helloBox.totals).length);
  });

  it("row values match totals data", () => {
    const entries = Object.entries(helloBox.totals);
    for (let i = 0; i < entries.length; i++) {
      expect(lines[i + 1]).toBe(`${entries[i][0]},${entries[i][1]}`);
    }
  });
});

// ── scheduleCsv ──────────────────────────────────────────────

describe("scheduleCsv", () => {
  const csv = scheduleCsv(helloBoxWindow);

  it("contains all section headers", () => {
    expect(csv).toContain("# Surfaces");
    expect(csv).toContain("# Openings");
    expect(csv).toContain("# Junctions");
    expect(csv).toContain("# Totals");
  });

  it("contains no undefined or null", () => {
    expect(csv).not.toContain("undefined");
    expect(csv).not.toContain("null");
  });
});
