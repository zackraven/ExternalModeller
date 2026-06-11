import { describe, it, expect, beforeEach } from "vitest";
import type { Vec2 } from "@sap-geometry/core";
import { solve } from "@sap-geometry/core";
import {
  ridgeGraphFromParametric,
  facesFromRidgeGraph,
  resetNodeCounter,
} from "../ridgeGraph";
import type { RidgeGraph } from "../ridgeGraph";
import { buildSpecFromMasses } from "../specFromVertices";
import type { MassDesign } from "../types";
import { DEFAULT_STOREY_HEIGHT } from "../constants";

// Standard 10×6 rectangle (hello-box footprint)
const RECT: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 6],
  [0, 6],
];

// L-shaped footprint
const L_PLAN: Vec2[] = [
  [0, 0],
  [10, 0],
  [10, 4],
  [6, 4],
  [6, 6],
  [0, 6],
];

const WALL_TOP_Z = DEFAULT_STOREY_HEIGHT; // 2.4

describe("ridgeGraphFromParametric", () => {
  beforeEach(() => resetNodeCounter());

  it("dual-pitch rect → 2 nodes, 1 segment at y = halfSpan", () => {
    const rg = ridgeGraphFromParametric(RECT, "dual", 35, 0, WALL_TOP_Z);
    expect(rg.nodes).toHaveLength(2);
    expect(rg.segments).toHaveLength(1);

    // Ridge should be at y = 3 (center of 6m span, along edge 0 which is the x-axis)
    for (const node of rg.nodes) {
      expect(node.pos[1]).toBeCloseTo(3, 1);
      expect(node.z).toBeGreaterThan(WALL_TOP_Z);
    }

    // Ridge nodes should be at x = 0 and x = 10
    const xs = rg.nodes.map(n => n.pos[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(0, 1);
    expect(xs[1]).toBeCloseTo(10, 1);
  });

  it("hip rect → 2 nodes, 1 segment inset from edges", () => {
    const rg = ridgeGraphFromParametric(RECT, "hip", 35, 0, WALL_TOP_Z);
    expect(rg.nodes).toHaveLength(2);
    expect(rg.segments).toHaveLength(1);

    // Ridge should be at y = 3 (center of span)
    for (const node of rg.nodes) {
      expect(node.pos[1]).toBeCloseTo(3, 1);
      expect(node.z).toBeGreaterThan(WALL_TOP_Z);
    }

    // Hip ridge is inset from x-edges by ~halfSpan distance
    const xs = rg.nodes.map(n => n.pos[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThan(0.5);
    expect(xs[1]).toBeLessThan(9.5);
  });

  it("mono rect → at least 2 nodes", () => {
    const rg = ridgeGraphFromParametric(RECT, "mono", 35, 0, WALL_TOP_Z);
    expect(rg.nodes.length).toBeGreaterThanOrEqual(2);
    // All ridge nodes should be above wall top
    for (const node of rg.nodes) {
      expect(node.z).toBeGreaterThan(WALL_TOP_Z);
    }
  });

  it("flat → empty graph", () => {
    const rg = ridgeGraphFromParametric(RECT, "flat", 35, 0, WALL_TOP_Z);
    expect(rg.nodes).toHaveLength(0);
    expect(rg.segments).toHaveLength(0);
  });
});

describe("facesFromRidgeGraph", () => {
  beforeEach(() => resetNodeCounter());

  it("rect + 1 ridge segment → 2 faces", () => {
    // Manual ridge graph for a dual-pitch: ridge at y=3, from x=0 to x=10
    const rg: RidgeGraph = {
      nodes: [
        { id: "a", pos: [0, 3], z: WALL_TOP_Z + 2 },
        { id: "b", pos: [10, 3], z: WALL_TOP_Z + 2 },
      ],
      segments: [{ from: "a", to: "b" }],
    };

    const faces = facesFromRidgeGraph(rg, RECT, WALL_TOP_Z);
    expect(faces.length).toBe(2);

    // Each face should have at least 3 vertices
    for (const face of faces) {
      expect(face.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("faces have correct z values", () => {
    const rg: RidgeGraph = {
      nodes: [
        { id: "a", pos: [0, 3], z: WALL_TOP_Z + 2 },
        { id: "b", pos: [10, 3], z: WALL_TOP_Z + 2 },
      ],
      segments: [{ from: "a", to: "b" }],
    };

    const faces = facesFromRidgeGraph(rg, RECT, WALL_TOP_Z);
    for (const face of faces) {
      for (const v of face.polygon) {
        // z should be at either wallTopZ or ridge height
        expect(v[2]).toBeGreaterThanOrEqual(WALL_TOP_Z - 0.01);
      }
    }
  });

  it("empty graph → no faces", () => {
    const rg: RidgeGraph = { nodes: [], segments: [] };
    const faces = facesFromRidgeGraph(rg, RECT, WALL_TOP_Z);
    expect(faces).toHaveLength(0);
  });

  it("offset ridge → 2 faces with asymmetric coverage", () => {
    // Ridge offset toward y=2 (not centered)
    const rg: RidgeGraph = {
      nodes: [
        { id: "a", pos: [0, 2], z: WALL_TOP_Z + 2 },
        { id: "b", pos: [10, 2], z: WALL_TOP_Z + 2 },
      ],
      segments: [{ from: "a", to: "b" }],
    };

    const faces = facesFromRidgeGraph(rg, RECT, WALL_TOP_Z);
    expect(faces.length).toBe(2);
  });
});

describe("round-trip: parametric → ridge graph → faces → solve", () => {
  beforeEach(() => resetNodeCounter());

  it("dual-pitch round-trip produces a solvable spec", () => {
    const rg = ridgeGraphFromParametric(RECT, "dual", 35, 0, WALL_TOP_Z);
    const customFaces = facesFromRidgeGraph(rg, RECT, WALL_TOP_Z);
    expect(customFaces.length).toBeGreaterThan(0);

    // Build a spec with custom roof from ridge graph
    const mass: MassDesign = {
      id: "test_mass",
      name: "test",
      vertices: RECT,
      closed: true,
      storeys: [{ height: WALL_TOP_Z }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
      ridgeGraph: rg,
    };

    const spec = buildSpecFromMasses([mass]);
    expect(spec.masses[0].roof?.type).toBe("custom");
    expect(spec.masses[0].roof?.faces?.length).toBeGreaterThan(0);

    // Should solve without error
    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
    expect(schedule.totals.roof).toBeGreaterThan(0);
  });

  it("hip round-trip produces a solvable spec", () => {
    const rg = ridgeGraphFromParametric(RECT, "hip", 35, 0, WALL_TOP_Z);
    const customFaces = facesFromRidgeGraph(rg, RECT, WALL_TOP_Z);
    expect(customFaces.length).toBeGreaterThan(0);

    const mass: MassDesign = {
      id: "test_mass",
      name: "test",
      vertices: RECT,
      closed: true,
      storeys: [{ height: WALL_TOP_Z }],
      roof: { type: "hip", pitch: 35, ridgeEdge: 0 },
      ridgeGraph: rg,
    };

    const spec = buildSpecFromMasses([mass]);
    const schedule = solve(spec);
    expect(schedule.surfaces.length).toBeGreaterThan(0);
    expect(schedule.totals.roof).toBeGreaterThan(0);
  });
});
