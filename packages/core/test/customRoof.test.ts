import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import { resolve } from "../src/resolve/index.js";
import type { BuildingSpec, Schedule, Vec3 } from "../src/types.js";

const TOL = 0.05;

// hello-box dual-pitch expressed as custom faces
const wallTopZ = 2.4;
const tan35 = Math.tan(35 * Math.PI / 180);
const ridgeZ = wallTopZ + 3 * tan35; // ≈ 4.5008

const customDualSpec: BuildingSpec = {
  masses: [{
    footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
    storeys: [{ height: 2.4 }],
    roof: {
      type: "custom",
      faces: [
        {
          polygon: [
            [0, 0, wallTopZ], [10, 0, wallTopZ], [10, 3, ridgeZ], [0, 3, ridgeZ],
          ] as Vec3[],
        },
        {
          polygon: [
            [10, 6, wallTopZ], [0, 6, wallTopZ], [0, 3, ridgeZ], [10, 3, ridgeZ],
          ] as Vec3[],
        },
      ],
    },
  }],
};

describe("Custom roof — dual-pitch on hello-box", () => {
  const schedule = solve(customDualSpec);
  const model = resolve(customDualSpec);

  it("produces 2 roof faces", () => {
    const roofs = schedule.surfaces.filter(s => s.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("each roof area ≈ 36.62", () => {
    const roofs = schedule.surfaces.filter(s => s.type === "roof");
    for (const r of roofs) {
      expect(r.area).toBeCloseTo(36.62, 1);
    }
  });

  it("both roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter(s => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("roof azimuths: 180° and 0°", () => {
    const roofs = schedule.surfaces.filter(s => s.type === "roof");
    const azimuths = roofs.map(r => r.azimuth).sort((a, b) => a - b);
    expect(azimuths[0]).toBeCloseTo(0, 1);
    expect(azimuths[1]).toBeCloseTo(180, 1);
  });

  it("produces 2 gable walls", () => {
    const gables = schedule.surfaces.filter(
      s => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(2);
  });

  it("each gable wall area ≈ 6.30", () => {
    const gables = schedule.surfaces.filter(
      s => s.type === "wall" && s.name.startsWith("Gable"),
    );
    for (const g of gables) {
      expect(g.area).toBeCloseTo(6.30, 1);
    }
  });

  it("correct face IDs", () => {
    const ids = model.faces.map(f => f.id).filter(id => id.includes("roof") || id.includes("gable"));
    expect(ids).toContain("mass_0_roof_p0");
    expect(ids).toContain("mass_0_roof_p1");
    // Gable walls on edges 1 and 3 (the 6m-wide sides)
    const gableIds = ids.filter(id => id.includes("gable"));
    expect(gableIds).toHaveLength(2);
  });

  it("roof normals point outward", () => {
    const roofFaces = model.faces.filter(f => f.tag.type === "roof");
    for (const f of roofFaces) {
      // Z component of normal should be positive (upward-facing)
      expect(f.normal[2]).toBeGreaterThan(0);
    }
  });
});

describe("Custom roof — single flat plane", () => {
  const flatCustomSpec: BuildingSpec = {
    masses: [{
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: {
        type: "custom",
        faces: [{
          polygon: [
            [0, 0, 2.4], [10, 0, 2.4], [10, 6, 2.4], [0, 6, 2.4],
          ] as Vec3[],
        }],
      },
    }],
  };
  const schedule = solve(flatCustomSpec);

  it("produces 1 roof face", () => {
    const roofs = schedule.surfaces.filter(s => s.type === "roof");
    expect(roofs).toHaveLength(1);
  });

  it("roof area = 60", () => {
    const roof = schedule.surfaces.find(s => s.type === "roof")!;
    expect(roof.area).toBeCloseTo(60, 1);
  });

  it("no gable walls", () => {
    const gables = schedule.surfaces.filter(
      s => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(0);
  });
});
