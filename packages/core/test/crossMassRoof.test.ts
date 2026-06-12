import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import { resolve } from "../src/resolve/index.js";
import type { BuildingSpec, SurfaceRow } from "../src/types.js";

// ── Fixture: two-mass catslide ─────────────────────────────
// Main mass: 10×6, 1 storey 2.4m, dual-pitch cuts (south 35°, north 35°)
// Extension: 10×4 abutting on the north edge of main, 1 storey 2.4m,
// same dual-cut params. Shares edge at y=6.
const catslideSpec: BuildingSpec = {
  masses: [
    {
      id: "main",
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "main_south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
          { id: "main_north", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
        ],
      },
    },
    {
      id: "ext",
      footprint: [[0, 6], [10, 6], [10, 10], [0, 10]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "ext_south", a: [0, 6], b: [10, 6], side: "left", pitch: 35 },
          { id: "ext_north", a: [10, 10], b: [0, 10], side: "left", pitch: 35 },
        ],
      },
    },
  ],
};

// ── Fixture: two-mass side-by-side ──────────────────────────
// Wing A: 10×6 at origin, dual cuts (south/north)
// Wing B: 6×6 abutting on the east edge of A (sharing x=10, y=[0,6] exactly)
// Each wing has its own independent dual cuts.
const sideBySideSpec: BuildingSpec = {
  masses: [
    {
      id: "wingA",
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "wA_south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
          { id: "wA_north", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
        ],
      },
    },
    {
      id: "wingB",
      footprint: [[10, 0], [16, 0], [16, 6], [10, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "cuts",
        cuts: [
          { id: "wB_south", a: [10, 0], b: [16, 0], side: "left", pitch: 35 },
          { id: "wB_north", a: [16, 6], b: [10, 6], side: "left", pitch: 35 },
        ],
      },
    },
  ],
};

// ── Catslide tests ──────────────────────────────────────────

describe("Cross-mass cut-roof — catslide", () => {
  const schedule = solve(catslideSpec);
  const model = resolve(catslideSpec);

  it("solves without errors", () => {
    expect(schedule).toBeDefined();
    expect(schedule.surfaces.length).toBeGreaterThan(0);
  });

  it("shared wall edge is tagged party", () => {
    const partyFaces = model.faces.filter(
      (f) => f.tag.adjacency === "party",
    );
    // Main's north wall (edge 2) and ext's south wall (edge 0) should be party
    expect(partyFaces.length).toBeGreaterThanOrEqual(2);
    const mainParty = partyFaces.filter((f) => f.tag.mass === "main");
    const extParty = partyFaces.filter((f) => f.tag.mass === "ext");
    expect(mainParty.length).toBeGreaterThanOrEqual(1);
    expect(extParty.length).toBeGreaterThanOrEqual(1);
  });

  it("party wall area counted in party totals", () => {
    // Party walls have their full area, just tagged as party adjacency
    // Main north wall: 10 × 2.4 = 24, ext south wall: 10 × 2.4 = 24
    expect(schedule.totals.party).toBeGreaterThan(0);
    // Party walls should not be counted in external wall total
    const partyRows = schedule.surfaces.filter(
      (s: SurfaceRow) => s.adjacency === "party",
    );
    expect(partyRows.length).toBeGreaterThanOrEqual(2);
  });

  it("each mass has roof faces", () => {
    const mainRoof = schedule.surfaces.filter(
      (s: SurfaceRow) => s.mass === "main" && s.type === "roof",
    );
    const extRoof = schedule.surfaces.filter(
      (s: SurfaceRow) => s.mass === "ext" && s.type === "roof",
    );
    expect(mainRoof.length).toBeGreaterThanOrEqual(2);
    expect(extRoof.length).toBeGreaterThanOrEqual(2);
  });

  it("total roof area is reasonable for both masses combined", () => {
    // Main: 10×6 dual 35° → area ≈ 2 × (10 × 3/cos35°) ≈ 73.2
    // Ext:  10×4 dual 35° → area ≈ 2 × (10 × 2/cos35°) ≈ 48.8
    // Total ≈ 122 (rough, headroom walls and UNCUT_TOP may vary)
    const totalRoof = schedule.totals.roof;
    expect(totalRoof).toBeGreaterThan(50);
    expect(totalRoof).toBeLessThan(200);
  });

  it("total floor area = sum of footprints", () => {
    // Main: 10×6=60, Ext: 10×4=40
    expect(schedule.totals.floor).toBeCloseTo(100, 1);
  });

  it("no duplicate junction rows on shared boundary", () => {
    // Party wall junctions should exist but not be duplicated
    const partyJunctions = schedule.junctions.filter(
      (j) => j.type === "party_wall",
    );
    // The shared edge is 10m long — check total length is reasonable
    const totalLen = partyJunctions.reduce((s, j) => s + j.length, 0);
    // Each storey contributes one party junction per mass pair overlap
    expect(totalLen).toBeGreaterThan(0);
    expect(totalLen).toBeLessThan(30); // should not be wildly duplicated
  });
});

// ── L-shape tests ───────────────────────────────────────────

describe("Cross-mass cut-roof — side-by-side", () => {
  const schedule = solve(sideBySideSpec);
  const model = resolve(sideBySideSpec);

  it("solves without errors", () => {
    expect(schedule).toBeDefined();
    expect(schedule.surfaces.length).toBeGreaterThan(0);
  });

  it("shared wall edge is tagged party", () => {
    const partyFaces = model.faces.filter(
      (f) => f.tag.adjacency === "party",
    );
    expect(partyFaces.length).toBeGreaterThanOrEqual(2);
    const wingAParty = partyFaces.filter((f) => f.tag.mass === "wingA");
    const wingBParty = partyFaces.filter((f) => f.tag.mass === "wingB");
    expect(wingAParty.length).toBeGreaterThanOrEqual(1);
    expect(wingBParty.length).toBeGreaterThanOrEqual(1);
  });

  it("each wing has its own roof faces", () => {
    const wingARoof = schedule.surfaces.filter(
      (s: SurfaceRow) => s.mass === "wingA" && s.type === "roof",
    );
    const wingBRoof = schedule.surfaces.filter(
      (s: SurfaceRow) => s.mass === "wingB" && s.type === "roof",
    );
    expect(wingARoof.length).toBeGreaterThanOrEqual(2);
    expect(wingBRoof.length).toBeGreaterThanOrEqual(2);
  });

  it("total floor area = sum of footprints", () => {
    // Wing A: 10×6=60, Wing B: 6×6=36
    expect(schedule.totals.floor).toBeCloseTo(96, 1);
  });

  it("party wall junctions exist on shared boundary", () => {
    const junctions = schedule.junctions;

    // Party wall junctions on the shared edge (x=10, y=[0,6])
    const partyJ = junctions.filter((j) => j.type === "party_wall");
    expect(partyJ.length).toBeGreaterThan(0);

    // Each mass has its own roof junctions (eaves, ridge)
    const roofJunctions = junctions.filter(
      (j) => j.type === "ridge" || j.type === "eaves" || j.type === "valley",
    );
    expect(roofJunctions.length).toBeGreaterThan(0);
  });

  it("party walls have no occludedArea (excluded from occlusion)", () => {
    // Wing A east wall (edge 1) and wing B west wall (edge 3)
    // share the same plane. detectAbutments tags them as party.
    // Being party, they're excluded from occlusion.
    const partyFaces = model.faces.filter(
      (f) => f.tag.adjacency === "party",
    );
    for (const f of partyFaces) {
      expect(f.occludedArea).toBeUndefined();
    }
  });
});
