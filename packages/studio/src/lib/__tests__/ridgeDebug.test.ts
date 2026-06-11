import { describe, it, expect, beforeEach } from "vitest";
import type { Vec2 } from "@sap-geometry/core";
import { validateCustomRoof, solve } from "@sap-geometry/core";
import {
  ridgeGraphFromParametric,
  facesFromRidgeGraph,
  resetNodeCounter,
} from "../ridgeGraph";
import { studioReducer } from "../reducer";
import type { StudioAction } from "../reducer";
import { buildSpecFromMasses } from "../specFromVertices";
import { defaultStudioState, resetMassCounter } from "../types";
import type { StudioState } from "../types";
import { FIXTURES } from "../fixtures";
import { DEFAULT_STOREY_HEIGHT } from "../constants";

const RECT: Vec2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
const WALL_TOP_Z = DEFAULT_STOREY_HEIGHT; // 2.4

/** Helper: load fixture, switch to custom, build spec, solve. */
function customRoofE2E(fixtureLabel: string, massIndex = 0) {
  resetNodeCounter();
  resetMassCounter();

  const fixture = FIXTURES.find((f) => f.label === fixtureLabel);
  if (!fixture) throw new Error(`Fixture "${fixtureLabel}" not found`);

  let state = defaultStudioState();
  state = studioReducer(state, { type: "LOAD_FIXTURE", spec: fixture.spec });

  const mass = state.masses[massIndex];
  if (!mass) throw new Error(`Mass index ${massIndex} not found`);
  if (mass.roof.type === "flat") return { state, spec: null, schedule: null, skipped: true };

  state = studioReducer(state, { type: "SET_ROOF_MODE", massId: mass.id, mode: "custom" });
  const spec = buildSpecFromMasses(state.masses);
  const schedule = solve(spec);
  return { state, spec, schedule, skipped: false };
}

describe("e2e: every fixture → custom mode → solve", () => {
  for (const fixture of FIXTURES) {
    it(`"${fixture.label}" mass 0 solves after custom switch`, () => {
      const { skipped, schedule } = customRoofE2E(fixture.label);
      if (skipped) return; // flat roofs can't switch to custom
      expect(schedule!.surfaces.length).toBeGreaterThan(0);
    });
  }
});

describe("user interactions: move ridge nodes, change z", () => {
  beforeEach(() => {
    resetNodeCounter();
    resetMassCounter();
  });

  it("dual-pitch: move ridge node position, still solves", () => {
    let state = defaultStudioState();
    const fixture = FIXTURES.find((f) => f.label === "dual-pitch")!;
    state = studioReducer(state, { type: "LOAD_FIXTURE", spec: fixture.spec });
    const massId = state.masses[0].id;

    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "custom" });
    const nodeId = state.masses[0].ridgeGraph!.nodes[0].id;

    // Move node from (10,3) to (10,4) — offset ridge
    state = studioReducer(state, {
      type: "UPDATE_RIDGE_NODE", massId, nodeId, pos: [10, 4] as Vec2,
    });

    const spec = buildSpecFromMasses(state.masses);
    console.log("Moved-node faces:", JSON.stringify(spec.masses[0].roof?.faces?.map(
      f => f.polygon.map(v => [+v[0].toFixed(2), +v[1].toFixed(2), +v[2].toFixed(2)])
    ), null, 2));

    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
    expect(schedule.totals.roof).toBeGreaterThan(0);
  });

  it("dual-pitch: change ridge z height, still solves", () => {
    let state = defaultStudioState();
    const fixture = FIXTURES.find((f) => f.label === "dual-pitch")!;
    state = studioReducer(state, { type: "LOAD_FIXTURE", spec: fixture.spec });
    const massId = state.masses[0].id;

    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "custom" });

    // Change both ridge nodes to z=5.0
    for (const node of state.masses[0].ridgeGraph!.nodes) {
      state = studioReducer(state, {
        type: "UPDATE_RIDGE_NODE", massId, nodeId: node.id, z: 5.0,
      });
    }

    const spec = buildSpecFromMasses(state.masses);
    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
    expect(schedule.totals.roof).toBeGreaterThan(0);
  });

  it("hip: move ridge node, still solves", () => {
    let state = defaultStudioState();
    const fixture = FIXTURES.find((f) => f.label === "hip-roof")!;
    state = studioReducer(state, { type: "LOAD_FIXTURE", spec: fixture.spec });
    const massId = state.masses[0].id;

    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "custom" });
    const nodeId = state.masses[0].ridgeGraph!.nodes[0].id;

    // Move hip ridge node
    state = studioReducer(state, {
      type: "UPDATE_RIDGE_NODE", massId, nodeId, pos: [8, 3] as Vec2,
    });

    const spec = buildSpecFromMasses(state.masses);
    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
  });

  it("manual box: draw vertices, set dual roof, switch custom, solve", () => {
    let state = defaultStudioState();
    // Draw a 8x5 box
    state = studioReducer(state, { type: "ADD_MASS" });
    state = studioReducer(state, { type: "ADD_VERTEX", vertex: [0, 0] });
    state = studioReducer(state, { type: "ADD_VERTEX", vertex: [8, 0] });
    state = studioReducer(state, { type: "ADD_VERTEX", vertex: [8, 5] });
    state = studioReducer(state, { type: "ADD_VERTEX", vertex: [0, 5] });
    state = studioReducer(state, { type: "CLOSE_MASS" });

    const massId = state.masses[0].id;

    // Set to dual roof
    state = studioReducer(state, {
      type: "UPDATE_MASS", id: massId,
      patch: { roof: { type: "dual", pitch: 40, ridgeEdge: 0 } },
    });

    // Switch to custom
    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "custom" });

    const rg = state.masses[0].ridgeGraph!;
    console.log("Manual box ridge graph:", JSON.stringify(rg, null, 2));
    expect(rg.nodes.length).toBeGreaterThanOrEqual(2);

    const spec = buildSpecFromMasses(state.masses);
    console.log("Manual box spec roof:", JSON.stringify(spec.masses[0].roof, null, 2));

    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
    expect(schedule.totals.roof).toBeGreaterThan(0);
  });

  it("switch custom → parametric → custom again, still works", () => {
    let state = defaultStudioState();
    const fixture = FIXTURES.find((f) => f.label === "dual-pitch")!;
    state = studioReducer(state, { type: "LOAD_FIXTURE", spec: fixture.spec });
    const massId = state.masses[0].id;

    // Custom → parametric → custom
    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "custom" });
    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "parametric" });
    expect(state.masses[0].ridgeGraph).toBeUndefined();

    state = studioReducer(state, { type: "SET_ROOF_MODE", massId, mode: "custom" });
    expect(state.masses[0].ridgeGraph).toBeDefined();

    const spec = buildSpecFromMasses(state.masses);
    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
  });
});

describe("church fixture: multi-mass with different roof types", () => {
  beforeEach(() => {
    resetNodeCounter();
    resetMassCounter();
  });

  it("church mass 0 (nave, dual) → custom → solve", () => {
    const { schedule, skipped } = customRoofE2E("church", 0);
    if (skipped) return;
    expect(schedule!.surfaces.length).toBeGreaterThan(0);
  });

  it("church mass 1 (tower, hip) → custom → solve", () => {
    const { schedule, skipped } = customRoofE2E("church", 1);
    if (skipped) return;
    expect(schedule!.surfaces.length).toBeGreaterThan(0);
  });
});
