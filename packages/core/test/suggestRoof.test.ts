import { describe, it, expect } from "vitest";
import { suggestRoof } from "../src/resolve/suggest.js";
import { solve } from "../src/solve.js";
import type { BuildingSpec, Vec2 } from "../src/types.js";
import helloBoxDualSpec from "../fixtures/hello-box-dual.spec.json";

const footprint: Vec2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
const wallTopZ = 2.4;

describe("suggestRoof", () => {
  it("flat → 1 face at wallTopZ", () => {
    const faces = suggestRoof(footprint, { type: "flat" }, wallTopZ);
    expect(faces).toHaveLength(1);
    // All vertices at wallTopZ
    for (const v of faces[0].polygon) {
      expect(v[2]).toBeCloseTo(wallTopZ, 4);
    }
  });

  it("dual → 2 faces", () => {
    const faces = suggestRoof(footprint, { type: "dual", pitch: 35, ridgeEdge: 0 }, wallTopZ);
    expect(faces).toHaveLength(2);
  });

  it("hip → 4 faces", () => {
    const faces = suggestRoof(footprint, { type: "hip", pitch: 35, ridgeEdge: 0 }, wallTopZ);
    expect(faces).toHaveLength(4);
  });

  it("mono → 1 face", () => {
    const faces = suggestRoof(footprint, { type: "mono", pitch: 30, ridgeEdge: 0 }, wallTopZ);
    expect(faces).toHaveLength(1);
  });
});

describe("suggestRoof round-trip equivalence", () => {
  // Generate custom faces from parametric dual spec
  const suggestedFaces = suggestRoof(footprint, { type: "dual", pitch: 35, ridgeEdge: 0 }, wallTopZ);

  const customSpec: BuildingSpec = {
    masses: [{
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "custom", faces: suggestedFaces },
    }],
  };

  const parametricSchedule = solve(helloBoxDualSpec as BuildingSpec);
  const customSchedule = solve(customSpec);

  it("same number of roof surfaces", () => {
    const pRoofs = parametricSchedule.surfaces.filter(s => s.type === "roof");
    const cRoofs = customSchedule.surfaces.filter(s => s.type === "roof");
    expect(cRoofs).toHaveLength(pRoofs.length);
  });

  it("same roof areas", () => {
    const pRoofs = parametricSchedule.surfaces.filter(s => s.type === "roof").map(s => s.area).sort();
    const cRoofs = customSchedule.surfaces.filter(s => s.type === "roof").map(s => s.area).sort();
    for (let i = 0; i < pRoofs.length; i++) {
      expect(cRoofs[i]).toBeCloseTo(pRoofs[i], 2);
    }
  });

  it("same roof azimuths", () => {
    const pRoofs = parametricSchedule.surfaces.filter(s => s.type === "roof").map(s => s.azimuth).sort();
    const cRoofs = customSchedule.surfaces.filter(s => s.type === "roof").map(s => s.azimuth).sort();
    for (let i = 0; i < pRoofs.length; i++) {
      expect(cRoofs[i]).toBeCloseTo(pRoofs[i], 2);
    }
  });

  it("same roof tilts", () => {
    const pRoofs = parametricSchedule.surfaces.filter(s => s.type === "roof").map(s => s.tilt).sort();
    const cRoofs = customSchedule.surfaces.filter(s => s.type === "roof").map(s => s.tilt).sort();
    for (let i = 0; i < pRoofs.length; i++) {
      expect(cRoofs[i]).toBeCloseTo(pRoofs[i], 2);
    }
  });

  it("same gable wall areas", () => {
    const pGables = parametricSchedule.surfaces
      .filter(s => s.type === "wall" && s.name.startsWith("Gable"))
      .map(s => s.area).sort();
    const cGables = customSchedule.surfaces
      .filter(s => s.type === "wall" && s.name.startsWith("Gable"))
      .map(s => s.area).sort();
    expect(cGables).toHaveLength(pGables.length);
    for (let i = 0; i < pGables.length; i++) {
      expect(cGables[i]).toBeCloseTo(pGables[i], 2);
    }
  });

  it("same roof total", () => {
    expect(customSchedule.totals.roof).toBeCloseTo(parametricSchedule.totals.roof, 2);
  });

  it("same junction types and lengths", () => {
    for (const pj of parametricSchedule.junctions) {
      const cj = customSchedule.junctions.find(j => j.type === pj.type);
      expect(cj).toBeDefined();
      expect(cj!.length).toBeCloseTo(pj.length, 2);
    }
  });
});
