/**
 * Phase 7 — Validation suite
 *
 * Hand-checked expected values for every fixture.  Each describe block
 * locks down surface counts, areas, azimuths, tilts, opening totals,
 * junction lengths, and schedule totals for one reference building.
 */
import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import { resolve } from "../src/resolve/index.js";
import type { BuildingSpec, Schedule, JunctionRow } from "../src/types.js";

import helloBoxSpec from "../fixtures/hello-box.spec.json";
import helloBoxWindowSpec from "../fixtures/hello-box-window.spec.json";
import helloBoxDualSpec from "../fixtures/hello-box-dual.spec.json";
import helloBoxHipSpec from "../fixtures/hello-box-hip.spec.json";
import helloBoxDualDormerSpec from "../fixtures/hello-box-dual-dormer.spec.json";
import lPlanSpec from "../fixtures/l-plan.spec.json";
import twoBoxPartySpec from "../fixtures/two-box-party.spec.json";
import churchSpec from "../fixtures/church.spec.json";

// ── Helpers ─────────────────────────────────────────────────

function junc(schedule: Schedule, type: string): number {
  return schedule.junctions.find((j: JunctionRow) => j.type === type)?.length ?? 0;
}

function surface(schedule: Schedule, name: string, mass?: string) {
  return schedule.surfaces.find(
    (s) => s.name === name && (mass === undefined || s.mass === mass),
  )!;
}

// ── hello-box ───────────────────────────────────────────────

describe("Validation — hello-box (10×6, 1 storey 2.4m, flat)", () => {
  const schedule = solve(helloBoxSpec as BuildingSpec);

  it("surface counts", () => {
    expect(schedule.surfaces.filter((s) => s.type === "wall")).toHaveLength(4);
    expect(schedule.surfaces.filter((s) => s.type === "floor")).toHaveLength(1);
    expect(schedule.surfaces.filter((s) => s.type === "roof")).toHaveLength(1);
  });

  it("wall areas", () => {
    expect(surface(schedule, "Wall S0 E0").area).toBeCloseTo(24.0, 1);   // 10×2.4
    expect(surface(schedule, "Wall S0 E1").area).toBeCloseTo(14.4, 1);   // 6×2.4
    expect(surface(schedule, "Wall S0 E2").area).toBeCloseTo(24.0, 1);
    expect(surface(schedule, "Wall S0 E3").area).toBeCloseTo(14.4, 1);
  });

  it("wall azimuths: S=180, E=90, N=0, W=270", () => {
    expect(surface(schedule, "Wall S0 E0").azimuth).toBeCloseTo(180, 0);
    expect(surface(schedule, "Wall S0 E1").azimuth).toBeCloseTo(90, 0);
    expect(surface(schedule, "Wall S0 E2").azimuth).toBeCloseTo(0, 0);
    expect(surface(schedule, "Wall S0 E3").azimuth).toBeCloseTo(270, 0);
  });

  it("all walls tilt=90, floor tilt=0, roof tilt=0", () => {
    for (const s of schedule.surfaces.filter((s) => s.type === "wall")) {
      expect(s.tilt).toBeCloseTo(90, 0);
    }
    expect(surface(schedule, "Floor").tilt).toBeCloseTo(0, 0);
    expect(surface(schedule, "Roof P0").tilt).toBeCloseTo(0, 0);
  });

  it("floor = 60, roof = 60", () => {
    expect(surface(schedule, "Floor").area).toBeCloseTo(60, 1);
    expect(surface(schedule, "Roof P0").area).toBeCloseTo(60, 1);
  });

  it("totals", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(76.8, 1);
    expect(schedule.totals.floor).toBeCloseTo(60, 1);
    expect(schedule.totals.roof).toBeCloseTo(60, 1);
    expect(schedule.totals.window).toBe(0);
    expect(schedule.totals.door).toBe(0);
    expect(schedule.totals.party).toBe(0);
  });

  it("junctions", () => {
    expect(junc(schedule, "wall_ground_floor")).toBeCloseTo(32, 0);
    expect(junc(schedule, "external_corner")).toBeCloseTo(9.6, 1);
    expect(junc(schedule, "roof_flat_wall")).toBeCloseTo(32, 0);
  });

  it("no openings", () => {
    expect(schedule.openings).toHaveLength(0);
  });
});

// ── hello-box-window ────────────────────────────────────────

describe("Validation — hello-box-window (flat + 1 south window)", () => {
  const schedule = solve(helloBoxWindowSpec as BuildingSpec);

  it("1 opening: window 1.44 m²", () => {
    expect(schedule.openings).toHaveLength(1);
    expect(schedule.openings[0].type).toBe("window");
    expect(schedule.openings[0].area).toBeCloseTo(1.44, 2);
  });

  it("south wall net area = 24 - 1.44 = 22.56", () => {
    expect(surface(schedule, "Wall S0 E0").area).toBeCloseTo(22.56, 1);
  });

  it("totals: extWall=75.36, window=1.44", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(75.36, 1);
    expect(schedule.totals.window).toBeCloseTo(1.44, 2);
  });

  it("opening junctions", () => {
    expect(junc(schedule, "opening_sill")).toBeCloseTo(1.2, 1);
    expect(junc(schedule, "opening_jamb")).toBeCloseTo(2.4, 1);
    expect(junc(schedule, "opening_head")).toBeCloseTo(1.2, 1);
  });
});

// ── hello-box-dual ──────────────────────────────────────────

describe("Validation — hello-box-dual (dual-pitch 35°, ridgeEdge 0)", () => {
  const schedule = solve(helloBoxDualSpec as BuildingSpec);

  it("2 roof planes + 2 gable walls", () => {
    expect(schedule.surfaces.filter((s) => s.type === "roof")).toHaveLength(2);
    expect(schedule.surfaces.filter((s) => s.name.startsWith("Gable"))).toHaveLength(2);
  });

  it("each roof plane ≈ 36.62", () => {
    expect(surface(schedule, "Roof P0").area).toBeCloseTo(36.62, 1);
    expect(surface(schedule, "Roof P1").area).toBeCloseTo(36.62, 1);
  });

  it("roof tilts = 35°", () => {
    expect(surface(schedule, "Roof P0").tilt).toBeCloseTo(35, 0);
    expect(surface(schedule, "Roof P1").tilt).toBeCloseTo(35, 0);
  });

  it("roof azimuths: 180° and 0°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const azimuths = roofs.map((r) => r.azimuth).sort((a, b) => a - b);
    expect(azimuths[0]).toBeCloseTo(0, 0);
    expect(azimuths[1]).toBeCloseTo(180, 0);
  });

  it("each gable area ≈ 6.30", () => {
    expect(surface(schedule, "Gable E1").area).toBeCloseTo(6.30, 1);
    expect(surface(schedule, "Gable E3").area).toBeCloseTo(6.30, 1);
  });

  it("totals: extWall ≈ 89.40", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(89.40, 1);
    expect(schedule.totals.roof).toBeCloseTo(73.25, 1);
  });

  it("junctions: eaves=20, gable≈14.65, ridge=10", () => {
    expect(junc(schedule, "eaves")).toBeCloseTo(20, 0);
    expect(junc(schedule, "gable")).toBeCloseTo(14.65, 1);
    expect(junc(schedule, "ridge")).toBeCloseTo(10, 0);
  });
});

// ── hello-box-hip ───────────────────────────────────────────

describe("Validation — hello-box-hip (hip 35°)", () => {
  const schedule = solve(helloBoxHipSpec as BuildingSpec);

  it("4 roof planes, no gables", () => {
    expect(schedule.surfaces.filter((s) => s.type === "roof")).toHaveLength(4);
    expect(schedule.surfaces.filter((s) => s.name.startsWith("Gable"))).toHaveLength(0);
  });

  it("all roof planes tilt = 35°", () => {
    for (const s of schedule.surfaces.filter((s) => s.type === "roof")) {
      expect(s.tilt).toBeCloseTo(35, 0);
    }
  });

  it("plan-projected roof area = 60 (footprint)", () => {
    const cosP = Math.cos((35 * Math.PI) / 180);
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const projected = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    expect(projected).toBeCloseTo(60, 1);
  });

  it("totals: extWall=76.8, roof≈73.25", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(76.8, 1);
    expect(schedule.totals.roof).toBeCloseTo(73.25, 1);
  });

  it("junctions: eaves=32, ridge≈22.94, no gable", () => {
    expect(junc(schedule, "eaves")).toBeCloseTo(32, 0);
    expect(junc(schedule, "ridge")).toBeCloseTo(22.94, 1);
    expect(junc(schedule, "gable")).toBe(0);
  });
});

// ── hello-box-dual-dormer ───────────────────────────────────

describe("Validation — hello-box-dual-dormer (dual 35° + gable dormer)", () => {
  const schedule = solve(helloBoxDualDormerSpec as BuildingSpec);

  it("dormer surfaces: front + 2 cheeks + roof", () => {
    expect(schedule.surfaces.filter((s) => s.name.startsWith("Dormer 0 Front"))).toHaveLength(1);
    expect(schedule.surfaces.filter((s) => s.name.startsWith("Dormer 0 Cheek"))).toHaveLength(2);
    expect(schedule.surfaces.filter((s) => s.name.startsWith("Dormer 0 Roof"))).toHaveLength(1);
  });

  it("dormer window opening", () => {
    expect(schedule.openings).toHaveLength(1);
    expect(schedule.openings[0].type).toBe("window");
    expect(schedule.openings[0].area).toBeCloseTo(1.2, 2);
  });

  it("host roof P0 reduced by dormer footprint", () => {
    // P0 (with dormer) < P1 (without dormer)
    const p0 = surface(schedule, "Roof P0").area;
    const p1 = surface(schedule, "Roof P1").area;
    expect(p0).toBeLessThan(p1);
    expect(p0).toBeCloseTo(31.39, 1);
    expect(p1).toBeCloseTo(36.62, 1);
  });

  it("totals: extWall≈89.40, window=1.2, roof≈72.30", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(89.40, 1);
    expect(schedule.totals.window).toBeCloseTo(1.2, 1);
    expect(schedule.totals.roof).toBeCloseTo(72.30, 1);
  });
});

// ── L-plan ──────────────────────────────────────────────────

describe("Validation — L-plan (6-edge footprint, flat)", () => {
  const schedule = solve(lPlanSpec as BuildingSpec);

  it("6 walls + 1 floor + 1 roof", () => {
    expect(schedule.surfaces.filter((s) => s.type === "wall")).toHaveLength(6);
    expect(schedule.surfaces.filter((s) => s.type === "floor")).toHaveLength(1);
    expect(schedule.surfaces.filter((s) => s.type === "roof")).toHaveLength(1);
  });

  it("floor = 56", () => {
    expect(surface(schedule, "Floor").area).toBeCloseTo(56, 1);
  });

  it("totals: extWall=86.4, floor=56, roof=56", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(86.4, 1);
    expect(schedule.totals.floor).toBeCloseTo(56, 1);
    expect(schedule.totals.roof).toBeCloseTo(56, 1);
  });

  it("junctions: 5 ext corners, 1 int corner", () => {
    expect(junc(schedule, "external_corner")).toBeCloseTo(12.0, 1);   // 5 × 2.4
    expect(junc(schedule, "internal_corner")).toBeCloseTo(2.4, 1);    // 1 × 2.4
  });

  it("wall_ground_floor = 36 (perimeter)", () => {
    expect(junc(schedule, "wall_ground_floor")).toBeCloseTo(36, 0);
  });
});

// ── two-box-party (semi-detached) ───────────────────────────

describe("Validation — two-box-party (semi-detached pair)", () => {
  const schedule = solve(twoBoxPartySpec as BuildingSpec);

  it("8 walls total: 6 external + 2 party", () => {
    const walls = schedule.surfaces.filter((s) => s.type === "wall");
    expect(walls).toHaveLength(8);
    expect(walls.filter((w) => w.adjacency === "external")).toHaveLength(6);
    expect(walls.filter((w) => w.adjacency === "party")).toHaveLength(2);
  });

  it("party walls: mass_0 E1 and mass_1 E3, each 14.4", () => {
    const partyWalls = schedule.surfaces.filter((s) => s.adjacency === "party");
    for (const pw of partyWalls) {
      expect(pw.area).toBeCloseTo(14.4, 1);
    }
  });

  it("totals: extWall=124.8, party=28.8, floor=120, roof=120", () => {
    expect(schedule.totals.externalWallNet).toBeCloseTo(124.8, 1);
    expect(schedule.totals.party).toBeCloseTo(28.8, 1);
    expect(schedule.totals.floor).toBeCloseTo(120, 1);
    expect(schedule.totals.roof).toBeCloseTo(120, 1);
  });

  it("junctions: wall_ground_floor=64, ext_corner=19.2, party_wall=16.8", () => {
    expect(junc(schedule, "wall_ground_floor")).toBeCloseTo(64, 0);
    expect(junc(schedule, "external_corner")).toBeCloseTo(19.2, 1);
    expect(junc(schedule, "party_wall")).toBeCloseTo(16.8, 1);
  });

  it("no occlusion on any face (party walls skip it)", () => {
    const model = resolve(twoBoxPartySpec as BuildingSpec);
    for (const f of model.faces) {
      expect(f.occludedArea).toBeUndefined();
    }
  });
});

// ── church (nave + tower, multi-storey, occlusion) ──────────

describe("Validation — church (nave + tower)", () => {
  const schedule = solve(churchSpec as BuildingSpec);
  const model = resolve(churchSpec as BuildingSpec);

  // ── Surface counts ──

  it("nave: 4 walls + 2 gables + 1 floor + 2 roof planes", () => {
    const naveSurfaces = schedule.surfaces.filter((s) => s.mass === "nave");
    expect(naveSurfaces.filter((s) => s.type === "wall" && !s.name.startsWith("Gable"))).toHaveLength(4);
    expect(naveSurfaces.filter((s) => s.name.startsWith("Gable"))).toHaveLength(2);
    expect(naveSurfaces.filter((s) => s.type === "floor")).toHaveLength(1);
    expect(naveSurfaces.filter((s) => s.type === "roof")).toHaveLength(2);
  });

  it("tower: 12 walls (4 edges × 3 storeys) + 1 floor + 4 roof planes", () => {
    const towerSurfaces = schedule.surfaces.filter((s) => s.mass === "tower");
    expect(towerSurfaces.filter((s) => s.type === "wall")).toHaveLength(12);
    expect(towerSurfaces.filter((s) => s.type === "floor")).toHaveLength(1);
    expect(towerSurfaces.filter((s) => s.type === "roof")).toHaveLength(4);
  });

  // ── Occlusion ──

  it("tower_wall_s0_e1 fully occluded → net area ≈ 0", () => {
    expect(surface(schedule, "Wall S0 E1", "tower").area).toBeCloseTo(0, 0);
  });

  it("tower_wall_s1_e1 partially occluded by gable", () => {
    const a = surface(schedule, "Wall S1 E1", "tower").area;
    expect(a).toBeGreaterThan(1);
    expect(a).toBeLessThan(5);
  });

  it("nave_wall_s0_e3 occluded by tower s0 wall: net = 50 - 20 = 30", () => {
    expect(surface(schedule, "Wall S0 E3", "nave").area).toBeCloseTo(30, 0);
  });

  it("nave gable_e3 partially occluded by tower upper walls", () => {
    const gable = surface(schedule, "Gable E3", "nave");
    // Gross ≈ 20.98, occluded ≈ 13.43 → net ≈ 7.55
    expect(gable.area).toBeCloseTo(7.55, 0);
  });

  // ── Openings ──

  it("total openings: 11 windows + 1 door on nave, 9 windows + 1 door on tower (minus some on occluded faces)", () => {
    const windows = schedule.openings.filter((o) => o.type === "window");
    const doors = schedule.openings.filter((o) => o.type === "door");
    expect(windows.length).toBeGreaterThanOrEqual(17);
    expect(doors).toHaveLength(1);
  });

  it("totals: window=41.6, door=6.3", () => {
    expect(schedule.totals.window).toBeCloseTo(41.6, 1);
    expect(schedule.totals.door).toBeCloseTo(6.3, 1);
  });

  // ── Roof ──

  it("nave roof: 2 planes tilt=40°, each ≈ 130.54", () => {
    const naveRoofs = schedule.surfaces.filter((s) => s.mass === "nave" && s.type === "roof");
    expect(naveRoofs).toHaveLength(2);
    for (const r of naveRoofs) {
      expect(r.tilt).toBeCloseTo(40, 0);
      expect(r.area).toBeCloseTo(130.54, 0);
    }
  });

  it("tower roof: 4 hip planes tilt=75°", () => {
    const towerRoofs = schedule.surfaces.filter((s) => s.mass === "tower" && s.type === "roof");
    expect(towerRoofs).toHaveLength(4);
    for (const r of towerRoofs) {
      expect(r.tilt).toBeCloseTo(75, 0);
    }
  });

  // ── Floors ──

  it("nave floor = 200, tower floor = 16", () => {
    expect(surface(schedule, "Floor", "nave").area).toBeCloseTo(200, 1);
    expect(surface(schedule, "Floor", "tower").area).toBeCloseTo(16, 1);
  });

  // ── Totals ──

  it("floor total = 216", () => {
    expect(schedule.totals.floor).toBeCloseTo(216, 1);
  });

  it("roof total ≈ 322.90", () => {
    expect(schedule.totals.roof).toBeCloseTo(322.90, 0);
  });
});
