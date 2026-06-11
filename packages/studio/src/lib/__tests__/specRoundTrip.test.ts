import { describe, it, expect } from "vitest";
import { massDesignsFromSpec } from "../reducer";
import { buildSpecFromMasses } from "../specFromVertices";
import { FIXTURES } from "../fixtures";

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
