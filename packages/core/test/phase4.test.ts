import { describe, it, expect } from "vitest";
import { solve } from "../src/solve.js";
import { resolve } from "../src/resolve/index.js";
import type { BuildingSpec, Schedule, JunctionRow } from "../src/types.js";
import helloBoxSpec from "../fixtures/hello-box.spec.json";
import helloBoxDualSpec from "../fixtures/hello-box-dual.spec.json";
import helloBoxHipSpec from "../fixtures/hello-box-hip.spec.json";

const TOL = 0.05;

function junctionLen(schedule: Schedule, type: string): number {
  const j = schedule.junctions.find((j: JunctionRow) => j.type === type);
  return j?.length ?? 0;
}

// L-shaped footprint for arbitrary-polygon tests
const L_FOOTPRINT: [number, number][] = [[0,0],[10,0],[10,4],[4,4],[4,8],[0,8]];
const L_FOOTPRINT_AREA = 56; // 10×4 + 4×4

describe("Phase 4 — flat roof (hello-box)", () => {
  const schedule = solve(helloBoxSpec as BuildingSpec);

  it("produces 1 roof plane", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(1);
  });

  it("roof area = 60", () => {
    const roof = schedule.surfaces.find((s) => s.type === "roof")!;
    expect(roof.area).toBeCloseTo(60, 1);
  });

  it("roof tilt = 0", () => {
    const roof = schedule.surfaces.find((s) => s.type === "roof")!;
    expect(roof.tilt).toBeCloseTo(0, 1);
  });

  it("roof_flat_wall junction length = 32 (full perimeter)", () => {
    expect(junctionLen(schedule, "roof_flat_wall")).toBeCloseTo(32, TOL);
  });

  it("roof total = 60", () => {
    expect(schedule.totals.roof).toBeCloseTo(60, 1);
  });
});

describe("Phase 4 — dual-pitch roof", () => {
  const schedule = solve(helloBoxDualSpec as BuildingSpec);

  it("produces 2 roof planes", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("each roof plane area ≈ 36.62", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.area).toBeCloseTo(36.62, 1);
    }
  });

  it("both roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("roof azimuths: 180° and 0°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const azimuths = roofs.map((r) => r.azimuth).sort((a, b) => a - b);
    expect(azimuths[0]).toBeCloseTo(0, 1);
    expect(azimuths[1]).toBeCloseTo(180, 1);
  });

  it("produces 2 gable walls", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(2);
  });

  it("each gable wall area ≈ 6.30", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    for (const g of gables) {
      expect(g.area).toBeCloseTo(6.30, 1);
    }
  });

  it("eaves length = 20 (2 × 10)", () => {
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(20, TOL);
  });

  it("gable junction length ≈ 14.65 (4 × 3.662)", () => {
    expect(junctionLen(schedule, "gable")).toBeCloseTo(14.65, TOL);
  });

  it("ridge length = 10", () => {
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(10, TOL);
  });
});

describe("Phase 4 — hip roof", () => {
  const schedule = solve(helloBoxHipSpec as BuildingSpec);

  it("produces 4 roof planes", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(4);
  });

  it("all roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("sum of plan-projected areas = 60 (footprint area)", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    expect(projectedSum).toBeCloseTo(60, 1);
  });

  it("eaves length = 32 (full perimeter)", () => {
    expect(junctionLen(schedule, "eaves")).toBeCloseTo(32, TOL);
  });

  it("ridge length ≈ 22.94 (central ridge + 4 hip edges)", () => {
    expect(junctionLen(schedule, "ridge")).toBeCloseTo(22.94, TOL);
  });

  it("no gable junctions", () => {
    expect(junctionLen(schedule, "gable")).toBe(0);
  });

  it("no gable wall surfaces", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(0);
  });
});

// ── Pitched roofs on arbitrary polygon footprints ────────────

describe("Phase 4 — mono roof on L-plan", () => {
  const spec: BuildingSpec = {
    masses: [{
      footprint: L_FOOTPRINT,
      storeys: [{ height: 2.4 }],
      roof: { type: "mono", pitch: 30, ridgeEdge: 0 },
    }],
  };
  const schedule = solve(spec);

  it("produces 1 roof face", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(1);
  });

  it("roof tilt = 30°", () => {
    const roof = schedule.surfaces.find((s) => s.type === "roof")!;
    expect(roof.tilt).toBeCloseTo(30, 1);
  });

  it("plan-projected roof area = footprint area", () => {
    const roof = schedule.surfaces.find((s) => s.type === "roof")!;
    const cosP = Math.cos((30 * Math.PI) / 180);
    expect(roof.area * cosP).toBeCloseTo(L_FOOTPRINT_AREA, 1);
  });

  it("produces gable walls on non-eaves edges", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    // Edges 1,2,3,4,5 get gables; edge 0 (eaves) is skipped
    expect(gables).toHaveLength(5);
  });
});

describe("Phase 4 — dual roof on L-plan", () => {
  const spec: BuildingSpec = {
    masses: [{
      footprint: L_FOOTPRINT,
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    }],
  };
  const schedule = solve(spec);

  it("produces 2 roof planes", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("both roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("plan-projected roof area = footprint area", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    expect(projectedSum).toBeCloseTo(L_FOOTPRINT_AREA, 1);
  });

  it("produces 4 gable walls", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    // Edges 1,2,3,5 get gables; edges 0,4 (eaves/opposite) are skipped
    expect(gables).toHaveLength(4);
  });

  it("roof azimuths: 180° and 0°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const azimuths = roofs.map((r) => r.azimuth).sort((a, b) => a - b);
    expect(azimuths[0]).toBeCloseTo(0, 1);
    expect(azimuths[1]).toBeCloseTo(180, 1);
  });
});

describe("Phase 4 — hip roof on L-plan (>4 vertices → falls back to dual)", () => {
  const spec: BuildingSpec = {
    masses: [{
      footprint: L_FOOTPRINT,
      storeys: [{ height: 2.4 }],
      roof: { type: "hip", pitch: 35, ridgeEdge: 0 },
    }],
  };
  const schedule = solve(spec);

  it("produces 2 roof planes (same as dual)", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("plan-projected roof area = footprint area", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    expect(projectedSum).toBeCloseTo(L_FOOTPRINT_AREA, 1);
  });

  it("produces gable walls (not hip triangles)", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables.length).toBeGreaterThan(0);
  });
});

describe("Phase 4 — dual roof on trapezoid", () => {
  // Non-rectangular 4-vertex quad: wider at bottom than top
  const trapezoid: [number, number][] = [[0,0],[10,0],[8,6],[2,6]];
  const spec: BuildingSpec = {
    masses: [{
      footprint: trapezoid,
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    }],
  };
  const schedule = solve(spec);

  it("produces 2 roof planes", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("both roof planes tilt = 35°", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    for (const r of roofs) {
      expect(r.tilt).toBeCloseTo(35, 1);
    }
  });

  it("plan-projected roof area = footprint area (48)", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    // Trapezoid area = (10+6)*6/2 = 48
    expect(projectedSum).toBeCloseTo(48, 1);
  });

  it("produces 2 gable walls (side edges)", () => {
    const gables = schedule.surfaces.filter(
      (s) => s.type === "wall" && s.name.startsWith("Gable"),
    );
    expect(gables).toHaveLength(2);
  });
});

// ── Face geometry verification (resolve output) ──────────────

describe("Phase 4 — dual roof on L-plan: no degenerate slit polygons", () => {
  const spec: BuildingSpec = {
    masses: [{
      footprint: L_FOOTPRINT,
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    }],
  };
  const model = resolve(spec);
  const roofFaces = model.faces.filter((f) => f.tag.type === "roof");

  it("side0 roof face has no collinear vertices", () => {
    // side0 = eaves side covering 10x4 lower rectangle
    // Before fix: had 5 vertices with 3 collinear at y=4: (10,4),(4,4),(0,4)
    // After fix: should have 4 vertices (collinear (4,4) removed)
    const side0 = roofFaces.find((f) => f.id.endsWith("_roof_p0"))!;
    expect(side0.vertices.length).toBe(4);
  });

  it("side1 roof face has no degenerate slit", () => {
    // side1 = opposite side covering 4x4 upper L
    // Before fix: had 5 vertices with degenerate slit at (10,4)
    // After fix: should have 4 vertices ((10,4) removed)
    const side1 = roofFaces.find((f) => f.id.endsWith("_roof_p1"))!;
    expect(side1.vertices.length).toBe(4);
  });

  it("roof face vertices stay within footprint XY bounds", () => {
    for (const face of roofFaces) {
      for (const [x, y] of face.vertices) {
        expect(x).toBeGreaterThanOrEqual(-0.001);
        expect(x).toBeLessThanOrEqual(10.001);
        expect(y).toBeGreaterThanOrEqual(-0.001);
        expect(y).toBeLessThanOrEqual(8.001);
      }
    }
  });
});

describe("Phase 4 — dual roof on T-shape: collinear cleanup", () => {
  // T-shape: wide bottom, narrow top extension
  const tShape: [number, number][] = [[0,0],[10,0],[10,4],[8,4],[8,8],[2,8],[2,4],[0,4]];
  const spec: BuildingSpec = {
    masses: [{
      footprint: tShape,
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    }],
  };
  const model = resolve(spec);
  const schedule = solve(spec);
  const roofFaces = model.faces.filter((f) => f.tag.type === "roof");

  it("produces 2 roof planes", () => {
    expect(roofFaces).toHaveLength(2);
  });

  it("side1 has no degenerate vertices from ridge at y=4", () => {
    // T-shape has 4 vertices at y=4 (the ridge).
    // After collinear removal, side1 should be a clean rectangle.
    const side1 = roofFaces.find((f) => f.id.endsWith("_roof_p1"))!;
    expect(side1.vertices.length).toBe(4);
  });

  it("plan-projected area = footprint area (64)", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    // T area = 10*4 + 6*4 = 64
    expect(projectedSum).toBeCloseTo(64, 1);
  });
});

describe("Phase 4 — dual roof on pentagon: ridge-crossing gable walls", () => {
  // Irregular pentagon where edges cross the ridge diagonally
  const pentagon: [number, number][] = [[0,0],[8,0],[10,3],[5,6],[0,5]];
  const spec: BuildingSpec = {
    masses: [{
      footprint: pentagon,
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    }],
  };
  const model = resolve(spec);
  const schedule = solve(spec);

  it("produces 2 roof planes", () => {
    const roofs = model.faces.filter((f) => f.tag.type === "roof");
    expect(roofs).toHaveLength(2);
  });

  it("gable on edge 4 ([0,5]->[0,0]) includes ridge crossing point", () => {
    // Edge 4 crosses the ridge: perpDist goes from 5 to 0 (halfSpan=3)
    // roofZ at [0,5] > wallTopZ AND ridge crosses => gable needs 4 vertices
    // (quad: [A_wtz, B_wtz, ridgeCross_ridgeZ, A_roofZ])
    const gable4 = model.faces.find((f) => f.id.endsWith("_gable_e4"));
    expect(gable4).toBeDefined();
    expect(gable4!.vertices.length).toBe(4);
  });

  it("plan-projected roof area = footprint area", () => {
    const roofs = schedule.surfaces.filter((s) => s.type === "roof");
    const cosP = Math.cos((35 * Math.PI) / 180);
    const projectedSum = roofs.reduce((sum, r) => sum + r.area * cosP, 0);
    // Pentagon area via shoelace: (0*0-8*0)+(8*3-10*0)+(10*6-5*3)+(5*5-0*6)+(0*0-0*5) = 0+24+45+25+0 = 94, /2 = 47
    // Let me compute: sum of xi*y(i+1) - x(i+1)*yi
    // (0,0)->(8,0): 0-0=0
    // (8,0)->(10,3): 24-0=24
    // (10,3)->(5,6): 60-15=45
    // (5,6)->(0,5): 25-0=25
    // (0,5)->(0,0): 0-0=0
    // Sum=94, area=47
    expect(projectedSum).toBeCloseTo(47, 0);
  });
});
