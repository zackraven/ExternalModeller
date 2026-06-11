import { describe, it, expect } from "vitest";
import { wallTopProfile } from "../src/resolve/wallTopProfile.js";
import { newell } from "../src/geometry.js";
import type { Face, Vec2, Vec3 } from "../src/types.js";

function makeFace(verts: Vec3[]): Face {
  const { area, normal } = newell(verts);
  return {
    id: "test",
    vertices: verts,
    normal,
    area,
    tag: { mass: "m", storey: 0, type: "roof", adjacency: "external" },
    openings: [],
  };
}

// hello-box: 10x6, wallTopZ=2.4, dual-pitch 35°, ridgeEdge=0 (bottom edge)
// Ridge runs along y=3 (halfSpan). ridgeZ = 2.4 + 3*tan(35°) ≈ 4.5008
const wallTopZ = 2.4;
const tan35 = Math.tan(35 * Math.PI / 180);
const ridgeZ = wallTopZ + 3 * tan35;

// Dual-pitch roof face 0: eaves side (y=0 to ridge at y=3)
// Vertices: [0,0,wtz], [10,0,wtz], [10,3,ridgeZ], [0,3,ridgeZ]
const dualFace0 = makeFace([
  [0, 0, wallTopZ], [10, 0, wallTopZ], [10, 3, ridgeZ], [0, 3, ridgeZ],
]);
// Dual-pitch roof face 1: opposite side (y=6 to ridge at y=3)
const dualFace1 = makeFace([
  [10, 6, wallTopZ], [0, 6, wallTopZ], [0, 3, ridgeZ], [10, 3, ridgeZ],
]);

describe("wallTopProfile", () => {
  it("returns empty for flat roof at wallTopZ", () => {
    const flatFace = makeFace([
      [0, 0, wallTopZ], [10, 0, wallTopZ], [10, 6, wallTopZ], [0, 6, wallTopZ],
    ]);
    // Edge 0: [0,0] → [10,0]
    const profile = wallTopProfile([0, 0], [10, 0], wallTopZ, [flatFace]);
    expect(profile).toHaveLength(0);
  });

  it("returns triangle profile for dual-pitch gable edge", () => {
    // Edge 1: [10,0] → [10,6] (right gable)
    const edgeA: Vec2 = [10, 0];
    const edgeB: Vec2 = [10, 6];
    const profile = wallTopProfile(edgeA, edgeB, wallTopZ, [dualFace0, dualFace1]);

    // Expect 3 points: B_roofZ at t=1 (y=6), ridge at t=0.5 (y=3), A_roofZ at t=0 (y=0)
    // But A (y=0) and B (y=6) are at wallTopZ, so they're filtered.
    // Only the ridge crossing at midpoint should remain.
    expect(profile).toHaveLength(1);
    expect(profile[0][2]).toBeCloseTo(ridgeZ, 2);
    // t=0.5 → x=10, y=3
    expect(profile[0][0]).toBeCloseTo(10, 4);
    expect(profile[0][1]).toBeCloseTo(3, 4);
  });

  it("returns single-point profile for mono-pitch gable edge", () => {
    // Mono roof: all vertices rise with perpendicular distance from edge 0
    // Face: [0,0,wtz], [10,0,wtz], [10,6,wtz+6*tan35], [0,6,wtz+6*tan35]
    const monoZ = wallTopZ + 6 * tan35;
    const monoFace = makeFace([
      [0, 0, wallTopZ], [10, 0, wallTopZ], [10, 6, monoZ], [0, 6, monoZ],
    ]);
    // Edge 1: [10,0] → [10,6] — right side
    const profile = wallTopProfile([10, 0], [10, 6], wallTopZ, [monoFace]);
    // Only the far end at (10,6,monoZ) is above wallTopZ
    expect(profile).toHaveLength(1);
    expect(profile[0][2]).toBeCloseTo(monoZ, 2);
    expect(profile[0][0]).toBeCloseTo(10, 4);
    expect(profile[0][1]).toBeCloseTo(6, 4);
  });

  it("edge crossing ridge yields correct peak height", () => {
    // Edge 3: [0,6] → [0,0] (left gable)
    const edgeA: Vec2 = [0, 6];
    const edgeB: Vec2 = [0, 0];
    const profile = wallTopProfile(edgeA, edgeB, wallTopZ, [dualFace0, dualFace1]);

    // Ridge at y=3 → t = (6-3)/6 = 0.5, z = ridgeZ
    expect(profile).toHaveLength(1);
    expect(profile[0][2]).toBeCloseTo(ridgeZ, 2);
    expect(profile[0][1]).toBeCloseTo(3, 4);
  });

  it("points are clipped to edge bounds", () => {
    // Use only a partial edge [10,1] → [10,5] — doesn't reach either eaves
    const edgeA: Vec2 = [10, 1];
    const edgeB: Vec2 = [10, 5];
    const profile = wallTopProfile(edgeA, edgeB, wallTopZ, [dualFace0, dualFace1]);

    // Ridge at y=3 → t = (3-1)/4 = 0.5
    // Both endpoints of roof faces at y=0 and y=6 are outside edge bounds
    // Only the ridge crossing remains
    expect(profile).toHaveLength(1);
    expect(profile[0][2]).toBeCloseTo(ridgeZ, 2);
    expect(profile[0][1]).toBeCloseTo(3, 4);
  });

  it("returns empty when no roof faces provided", () => {
    const profile = wallTopProfile([0, 0], [10, 0], wallTopZ, []);
    expect(profile).toHaveLength(0);
  });
});
