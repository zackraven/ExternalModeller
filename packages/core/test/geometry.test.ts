import { describe, it, expect } from "vitest";
import type { Vec2, Vec3 } from "../src/types.js";
import {
  snap,
  snapVec3,
  cross,
  dot,
  sub,
  length,
  normalize,
  rotateCW90,
  shoelace,
  isCCW,
  ensureCCW,
  newell,
  azimuthOf,
  tiltOf,
  dist3,
  perimeter2D,
} from "../src/geometry.js";

const TOL = 1e-6;

describe("snap", () => {
  it("snaps to 1e-4 grid", () => {
    expect(snap(1.00001)).toBeCloseTo(1.0, 4);
    expect(snap(2.34567)).toBeCloseTo(2.3457, 4);
  });
});

describe("snapVec3", () => {
  it("snaps each component", () => {
    const v = snapVec3([1.00001, 2.00002, 3.00003]);
    expect(v[0]).toBeCloseTo(1.0, 4);
    expect(v[1]).toBeCloseTo(2.0, 4);
    expect(v[2]).toBeCloseTo(3.0, 4);
  });
});

describe("vector ops", () => {
  it("cross product", () => {
    const result = cross([1, 0, 0], [0, 1, 0]);
    expect(result).toEqual([0, 0, 1]);
  });

  it("dot product", () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it("sub", () => {
    expect(sub([3, 2, 1], [1, 1, 1])).toEqual([2, 1, 0]);
  });

  it("length", () => {
    expect(length([3, 4, 0])).toBe(5);
  });

  it("normalize", () => {
    const n = normalize([0, 0, 5]);
    expect(n[0]).toBeCloseTo(0, 10);
    expect(n[1]).toBeCloseTo(0, 10);
    expect(n[2]).toBeCloseTo(1, 10);
  });

  it("normalize zero vector", () => {
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe("rotateCW90", () => {
  it("rotates +X to +Y, -X", () => {
    // (1,0) → (0,-1)
    expect(rotateCW90([1, 0])).toEqual([0, -1]);
  });

  it("rotates +Y to +X", () => {
    // (0,1) → (1, -0)
    const [x, y] = rotateCW90([0, 1]);
    expect(x).toBe(1);
    expect(y).toBeCloseTo(0, 10);
  });

  it("gives outward normal for a south-facing edge", () => {
    // Edge from (0,0) to (10,0): direction (1,0) → outward normal (0,-1) = south = -Y ✓
    const d: Vec2 = [1, 0];
    const n = rotateCW90(d);
    expect(n).toEqual([0, -1]);
  });
});

describe("shoelace", () => {
  it("CCW unit square has positive area", () => {
    const sq: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(shoelace(sq)).toBeCloseTo(1.0, 10);
  });

  it("CW unit square has negative area", () => {
    const sq: Vec2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(shoelace(sq)).toBeCloseTo(-1.0, 10);
  });

  it("10x6 rectangle area = 60", () => {
    const rect: Vec2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    expect(shoelace(rect)).toBeCloseTo(60, 10);
  });
});

describe("isCCW / ensureCCW", () => {
  it("detects CCW", () => {
    expect(isCCW([[0, 0], [1, 0], [1, 1], [0, 1]])).toBe(true);
  });

  it("detects CW", () => {
    expect(isCCW([[0, 0], [0, 1], [1, 1], [1, 0]])).toBe(false);
  });

  it("ensureCCW reverses CW polygon", () => {
    const cw: Vec2[] = [[0, 0], [0, 1], [1, 1], [1, 0]];
    const result = ensureCCW(cw);
    expect(isCCW(result)).toBe(true);
  });

  it("ensureCCW leaves CCW polygon unchanged", () => {
    const ccw: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const result = ensureCCW(ccw);
    expect(result).toBe(ccw); // same reference
  });
});

describe("newell", () => {
  it("unit square in XY plane → area 1, normal +Z", () => {
    // CCW when viewed from +Z
    const verts: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
    const { area, normal } = newell(verts);
    expect(area).toBeCloseTo(1.0, 6);
    expect(normal[0]).toBeCloseTo(0, 6);
    expect(normal[1]).toBeCloseTo(0, 6);
    expect(normal[2]).toBeCloseTo(1, 6);
  });

  it("2x3 rectangle in XY plane → area 6", () => {
    const verts: Vec3[] = [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0]];
    const { area } = newell(verts);
    expect(area).toBeCloseTo(6.0, 6);
  });

  it("vertical quad facing -Y (south wall)", () => {
    // A wall along the X axis at y=0, from z=0 to z=1
    // Vertices wound so normal points -Y (outward from building)
    const verts: Vec3[] = [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]];
    const { area, normal } = newell(verts);
    expect(area).toBeCloseTo(1.0, 6);
    // Normal should be -Y (south-facing)
    expect(normal[0]).toBeCloseTo(0, 6);
    expect(normal[1]).toBeCloseTo(-1, 6);
    expect(normal[2]).toBeCloseTo(0, 6);
  });

  it("vertical quad facing +X (east wall)", () => {
    // Viewed from +X, vertices are CCW → normal points +X
    const verts: Vec3[] = [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]];
    const { area, normal } = newell(verts);
    expect(area).toBeCloseTo(1.0, 6);
    expect(normal[0]).toBeCloseTo(1, 6);
    expect(normal[1]).toBeCloseTo(0, 6);
    expect(normal[2]).toBeCloseTo(0, 6);
  });

  it("triangle area = half base*height", () => {
    const verts: Vec3[] = [[0, 0, 0], [4, 0, 0], [0, 3, 0]];
    const { area } = newell(verts);
    expect(area).toBeCloseTo(6.0, 6);
  });
});

describe("azimuthOf", () => {
  it("normal +Y → azimuth 0 (North)", () => {
    expect(azimuthOf([0, 1, 0])).toBeCloseTo(0, 6);
  });

  it("normal +X → azimuth 90 (East)", () => {
    expect(azimuthOf([1, 0, 0])).toBeCloseTo(90, 6);
  });

  it("normal -Y → azimuth 180 (South)", () => {
    expect(azimuthOf([0, -1, 0])).toBeCloseTo(180, 6);
  });

  it("normal -X → azimuth 270 (West)", () => {
    expect(azimuthOf([-1, 0, 0])).toBeCloseTo(270, 6);
  });

  it("with northAngle rotation", () => {
    // Normal pointing +Y (model north), northAngle=45 → true azimuth = 45
    expect(azimuthOf([0, 1, 0], 45)).toBeCloseTo(45, 6);
  });

  it("northAngle wraps around 360", () => {
    // Normal -X = 270 model, northAngle 100 → 370 → 10
    expect(azimuthOf([-1, 0, 0], 100)).toBeCloseTo(10, 6);
  });
});

describe("tiltOf", () => {
  it("horizontal face (normal +Z) → tilt 0", () => {
    expect(tiltOf([0, 0, 1])).toBeCloseTo(0, 6);
  });

  it("horizontal face (normal -Z, floor) → tilt 0", () => {
    expect(tiltOf([0, 0, -1])).toBeCloseTo(0, 6);
  });

  it("vertical face → tilt 90", () => {
    expect(tiltOf([0, -1, 0])).toBeCloseTo(90, 6);
    expect(tiltOf([1, 0, 0])).toBeCloseTo(90, 6);
  });

  it("35° pitched roof", () => {
    // Normal tilted 35° from vertical: nz = cos(35°), horizontal component = sin(35°)
    const rad = (35 * Math.PI) / 180;
    const normal: Vec3 = [0, -Math.sin(rad), Math.cos(rad)];
    expect(tiltOf(normal)).toBeCloseTo(35, 4);
  });

  it("45° pitched surface", () => {
    const s = Math.SQRT1_2;
    expect(tiltOf([s, 0, s])).toBeCloseTo(45, 6);
  });
});

describe("dist3", () => {
  it("distance between two points", () => {
    expect(dist3([0, 0, 0], [3, 4, 0])).toBeCloseTo(5, 10);
  });
});

describe("perimeter2D", () => {
  it("10x6 rectangle perimeter = 32", () => {
    const rect: Vec2[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    expect(perimeter2D(rect)).toBeCloseTo(32, 10);
  });

  it("unit square perimeter = 4", () => {
    const sq: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(perimeter2D(sq)).toBeCloseTo(4, 10);
  });
});
