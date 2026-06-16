import { describe, it, expect } from "vitest";
import { massDesignsFromSpec, studioReducer } from "../reducer";
import type { StudioAction } from "../reducer";
import { buildSpecFromMasses } from "../specFromVertices";
import { FIXTURES } from "../fixtures";
import { defaultStudioState, resetMassCounter } from "../types";
import type { StudioState, MassDesign } from "../types";
import { solve } from "@sap-geometry/core";

describe("round-trip: massDesignsFromSpec → buildSpecFromMasses", () => {
  for (const fixture of FIXTURES) {
    it(`preserves mass count for "${fixture.label}"`, () => {
      const designs = massDesignsFromSpec(fixture.spec);
      const rebuilt = buildSpecFromMasses(designs);
      expect(rebuilt.masses.length).toBe(fixture.spec.masses.length);
    });

    it(`preserves footprints for "${fixture.label}"`, () => {
      const designs = massDesignsFromSpec(fixture.spec);
      const rebuilt = buildSpecFromMasses(designs);
      for (let i = 0; i < fixture.spec.masses.length; i++) {
        expect(rebuilt.masses[i].footprint).toEqual(fixture.spec.masses[i].footprint);
      }
    });

    it(`preserves storey counts for "${fixture.label}"`, () => {
      const designs = massDesignsFromSpec(fixture.spec);
      const rebuilt = buildSpecFromMasses(designs);
      for (let i = 0; i < fixture.spec.masses.length; i++) {
        expect(rebuilt.masses[i].storeys.length).toBe(fixture.spec.masses[i].storeys.length);
      }
    });

    it(`preserves roof types for "${fixture.label}"`, () => {
      const designs = massDesignsFromSpec(fixture.spec);
      const rebuilt = buildSpecFromMasses(designs);
      for (let i = 0; i < fixture.spec.masses.length; i++) {
        const origType = fixture.spec.masses[i].roof?.type ?? "flat";
        const expected = origType === "none" ? "flat" : origType;
        expect(rebuilt.masses[i].roof?.type).toBe(expected);
      }
    });
  }

  it("church fixture preserves mass IDs", () => {
    const church = FIXTURES.find((f) => f.label === "church")!;
    const designs = massDesignsFromSpec(church.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].id).toBe("nave");
    expect(rebuilt.masses[1].id).toBe("tower");
  });

  it("church fixture preserves storey counts", () => {
    const church = FIXTURES.find((f) => f.label === "church")!;
    const designs = massDesignsFromSpec(church.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].storeys).toHaveLength(1);
    expect(rebuilt.masses[1].storeys).toHaveLength(3);
  });

  it("church fixture preserves opening counts", () => {
    const church = FIXTURES.find((f) => f.label === "church")!;
    const designs = massDesignsFromSpec(church.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].openings).toHaveLength(3);
    expect(rebuilt.masses[1].openings).toHaveLength(9);
  });

  it("abutting boxes fixture preserves both footprints exactly", () => {
    const abutting = FIXTURES.find((f) => f.label === "abutting boxes")!;
    const designs = massDesignsFromSpec(abutting.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].footprint).toEqual([[0,0],[10,0],[10,6],[0,6]]);
    expect(rebuilt.masses[1].footprint).toEqual([[10,0],[20,0],[20,6],[10,6]]);
  });

  it("dormer cottage preserves components", () => {
    const dormer = FIXTURES.find((f) => f.label === "dormer cottage")!;
    const designs = massDesignsFromSpec(dormer.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].components).toHaveLength(1);
    expect(rebuilt.masses[0].openings).toHaveLength(3);
  });

  it("roof pitch preserved for non-flat roofs", () => {
    const dual = FIXTURES.find((f) => f.label === "dual-pitch")!;
    const designs = massDesignsFromSpec(dual.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].roof?.pitch).toBe(35);
    expect(rebuilt.masses[0].roof?.ridgeEdge).toBe(0);
  });

  it("flat roof omits pitch and ridgeEdge", () => {
    const box = FIXTURES.find((f) => f.label === "hello-box")!;
    const designs = massDesignsFromSpec(box.spec);
    const rebuilt = buildSpecFromMasses(designs);
    expect(rebuilt.masses[0].roof?.type).toBe("flat");
    expect(rebuilt.masses[0].roof?.pitch).toBeUndefined();
    expect(rebuilt.masses[0].roof?.ridgeEdge).toBeUndefined();
  });
});

describe("hello-box-window from studio state", () => {
  function dispatch(state: StudioState, action: StudioAction): StudioState {
    return studioReducer(state, action);
  }

  it("generates spec matching hello-box-window fixture", () => {
    resetMassCounter();
    let s = dispatch(defaultStudioState(), { type: "ADD_MASS" });
    s = dispatch(s, { type: "ADD_VERTEX", vertex: [0, 0] });
    s = dispatch(s, { type: "ADD_VERTEX", vertex: [10, 0] });
    s = dispatch(s, { type: "ADD_VERTEX", vertex: [10, 6] });
    s = dispatch(s, { type: "ADD_VERTEX", vertex: [0, 6] });
    s = dispatch(s, { type: "CLOSE_MASS" });

    const massId = s.masses[0].id;
    s = dispatch(s, {
      type: "ADD_OPENING",
      massId,
      opening: { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
    });

    const spec = buildSpecFromMasses(s.masses);
    expect(spec.masses).toHaveLength(1);
    expect(spec.masses[0].footprint).toEqual([[0, 0], [10, 0], [10, 6], [0, 6]]);
    expect(spec.masses[0].openings).toHaveLength(1);
    expect(spec.masses[0].openings![0]).toEqual({
      storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9,
    });
  });
});

describe("headroom round-trip through buildSpecFromMasses → solve", () => {
  /** Create a 10×6 box mass with dual cuts and specified headroom. */
  function makeCutMass(headroom?: number): MassDesign {
    const fp: [number, number][] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    return {
      id: "test_mass",
      name: "test_mass",
      vertices: fp,
      closed: true,
      storeys: [{ height: 2.4 }],
      roof: { type: "cuts", pitch: 35, ridgeEdge: 0 },
      roofCuts: [
        { id: "cut_s", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
        { id: "cut_n", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
      ],
      headroom,
    };
  }

  it("buildSpecFromMasses includes headroom in roof when set", () => {
    const mass = makeCutMass(5);
    const spec = buildSpecFromMasses([mass]);
    expect(spec.masses[0].roof?.type).toBe("cuts");
    expect(spec.masses[0].roof?.headroom).toBe(5);
  });

  it("buildSpecFromMasses omits headroom when undefined", () => {
    const mass = makeCutMass(undefined);
    const spec = buildSpecFromMasses([mass]);
    expect(spec.masses[0].roof?.type).toBe("cuts");
    expect(spec.masses[0].roof?.headroom).toBeUndefined();
  });

  it("different headroom produces different roof area in schedule", () => {
    // headroom = 12 (default): cuts meet at a ridge, full dual-pitch roof
    const specDefault = buildSpecFromMasses([makeCutMass(undefined)]);
    const scheduleDefault = solve(specDefault);

    // headroom = 1: cuts clip the short prism, flat top should survive
    const specShort = buildSpecFromMasses([makeCutMass(1)]);
    const scheduleShort = solve(specShort);

    // With headroom=1, the prism top is at 3.4m.
    // Ridge of 35° dual on 6m width would be at 2.4 + 3*tan(35°) ≈ 4.5m
    // Since prism top (3.4m) < ridge height (4.5m), a flat top face survives.
    const defaultRoofArea = scheduleDefault.totals.roof;
    const shortRoofArea = scheduleShort.totals.roof;
    expect(shortRoofArea).not.toBeCloseTo(defaultRoofArea, 0);
  });

  it("headroom=1 produces an UNCUT_TOP flat face", () => {
    const spec = buildSpecFromMasses([makeCutMass(1)]);
    const schedule = solve(spec);
    // Should have a roof face with tilt=0 (flat top survivor)
    const flatTop = schedule.surfaces.find(
      (s) => s.type === "roof" && s.tilt === 0,
    );
    expect(flatTop).toBeDefined();
    expect(flatTop!.area).toBeGreaterThan(0);
  });

  it("UPDATE_MASS headroom → buildSpecFromMasses preserves roofCuts", () => {
    resetMassCounter();
    let s = studioReducer(defaultStudioState(), { type: "ADD_MASS" });
    s = studioReducer(s, { type: "ADD_VERTEX", vertex: [0, 0] });
    s = studioReducer(s, { type: "ADD_VERTEX", vertex: [10, 0] });
    s = studioReducer(s, { type: "ADD_VERTEX", vertex: [10, 6] });
    s = studioReducer(s, { type: "ADD_VERTEX", vertex: [0, 6] });
    s = studioReducer(s, { type: "CLOSE_MASS" });
    const id = s.masses[0].id;

    // Set roof type to cuts
    s = studioReducer(s, {
      type: "UPDATE_MASS",
      id,
      patch: { roof: { type: "cuts", pitch: 35, ridgeEdge: 0 } },
    });

    // Add dual cuts
    s = studioReducer(s, {
      type: "ADD_CUT",
      massId: id,
      cut: { id: "cut_s", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
    });
    s = studioReducer(s, {
      type: "ADD_CUT",
      massId: id,
      cut: { id: "cut_n", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
    });

    // Verify cuts exist
    expect(s.masses[0].roofCuts).toHaveLength(2);

    // Now update headroom via the same path as handleDesignChange
    s = studioReducer(s, {
      type: "UPDATE_MASS",
      id,
      patch: {
        storeys: s.masses[0].storeys,
        roof: s.masses[0].roof,
        openings: s.masses[0].openings,
        components: s.masses[0].components,
        headroom: 1,
      },
    });

    // roofCuts must survive the UPDATE_MASS
    expect(s.masses[0].roofCuts).toHaveLength(2);
    expect(s.masses[0].headroom).toBe(1);

    // Build spec and verify headroom is included
    const spec = buildSpecFromMasses(s.masses);
    expect(spec.masses[0].roof?.type).toBe("cuts");
    expect(spec.masses[0].roof?.cuts).toHaveLength(2);
    expect(spec.masses[0].roof?.headroom).toBe(1);

    // Solve and verify model is different from default
    const schedule = solve(spec);
    const flatTop = schedule.surfaces.find(
      (sf) => sf.type === "roof" && sf.tilt === 0,
    );
    expect(flatTop).toBeDefined();
  });
});
