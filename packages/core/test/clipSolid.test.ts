import { describe, it, expect } from "vitest";
import type { Vec3 } from "../src/types.js";
import {
  clipSolid,
  planeFromCut,
  chainLoops,
  orientLoop,
  type SolidFace,
  type Plane,
  type RoofCut,
} from "../src/resolve/clipSolid.js";
import { newell, dot } from "../src/geometry.js";

// ── assertClosed: master invariant ──────────────────────────

/**
 * Every undirected edge in a closed solid appears in exactly 2 faces
 * with opposite winding directions.
 */
function assertClosed(faces: SolidFace[], label?: string): void {
  const edgeMap = new Map<string, { face: number; dir: "fwd" | "rev" }[]>();

  for (let fi = 0; fi < faces.length; fi++) {
    const poly = faces[fi].polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const keyFwd = edgeKey(a, b);
      const keyRev = edgeKey(b, a);

      // Store as forward direction (a→b)
      if (!edgeMap.has(keyFwd)) edgeMap.set(keyFwd, []);
      edgeMap.get(keyFwd)!.push({ face: fi, dir: "fwd" });

      // Also check reverse — if reverse key exists, that means another face
      // has this edge in opposite direction, which is correct
    }
  }

  // Re-approach: count directed edges. Each undirected edge {A,B} should have
  // exactly one A→B and one B→A across all faces.
  const directed = new Map<string, number>();

  for (let fi = 0; fi < faces.length; fi++) {
    const poly = faces[fi].polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const key = edgeKey(a, b);
      directed.set(key, (directed.get(key) ?? 0) + 1);
    }
  }

  // For every directed edge A→B, there must be exactly one B→A
  for (const [key, count] of directed) {
    const [ax, ay, az, bx, by, bz] = key.split(",").map(Number);
    const revKey = edgeKey([bx, by, bz], [ax, ay, az]);
    const revCount = directed.get(revKey) ?? 0;

    const ctx = label ? ` [${label}]` : "";
    expect(count).toBe(1,
      `Edge ${key} appears ${count} times (should be 1)${ctx}`);
    expect(revCount).toBe(1,
      `Reverse of edge ${key} appears ${revCount} times (should be 1)${ctx}`);
  }
}

function edgeKey(a: Vec3, b: Vec3): string {
  return `${snap6(a[0])},${snap6(a[1])},${snap6(a[2])},${snap6(b[0])},${snap6(b[1])},${snap6(b[2])}`;
}

function snap6(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}

// ── Prism helpers ───────────────────────────────────────────

/** Build a closed axis-aligned box as a solid. */
function makeBox(
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): SolidFace[] {
  // 6 faces, each wound with outward normal
  return [
    // Floor (z=z0), normal -Z
    { polygon: [[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0]], tags: { type: "floor" } },
    // Top (z=z1), normal +Z
    { polygon: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], tags: { type: "top" } },
    // Front (y=y0), normal -Y
    { polygon: [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], tags: { type: "wall" } },
    // Back (y=y1), normal +Y
    { polygon: [[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1]], tags: { type: "wall" } },
    // Left (x=x0), normal -X
    { polygon: [[x0,y1,z0],[x0,y0,z0],[x0,y0,z1],[x0,y1,z1]], tags: { type: "wall" } },
    // Right (x=x1), normal +X
    { polygon: [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]], tags: { type: "wall" } },
  ];
}

/** Build an L-shaped prism (extruded L in XY). */
function makeLPrism(height: number): SolidFace[] {
  // L footprint: (0,0),(10,0),(10,4),(4,4),(4,8),(0,8) — CCW
  const fp: Vec3[] = [
    [0,0,0],[10,0,0],[10,4,0],[4,4,0],[4,8,0],[0,8,0],
  ];
  const fpTop: Vec3[] = fp.map(([x,y]) => [x, y, height] as Vec3);

  const faces: SolidFace[] = [];

  // Floor: normal -Z (CW when viewed from above)
  faces.push({ polygon: [...fp].reverse(), tags: { type: "floor" } });

  // Top: normal +Z (CCW when viewed from above)
  faces.push({ polygon: [...fpTop], tags: { type: "top" } });

  // Walls: for each footprint edge, extrude to a quad
  for (let i = 0; i < fp.length; i++) {
    const j = (i + 1) % fp.length;
    // Wall outward normal: right-hand rule with CCW footprint
    // Edge goes A→B at z=0, so wall is [A_bot, B_bot, B_top, A_top]
    faces.push({
      polygon: [fp[i], fp[j], fpTop[j], fpTop[i]],
      tags: { type: "wall", edge: i },
    });
  }

  return faces;
}

/** Build a U-shaped prism. */
function makeUPrism(height: number): SolidFace[] {
  // U footprint: open at top (y=8), three sides
  // (0,0),(10,0),(10,8),(8,8),(8,2),(2,2),(2,8),(0,8) — CCW
  const fp: Vec3[] = [
    [0,0,0],[10,0,0],[10,8,0],[8,8,0],[8,2,0],[2,2,0],[2,8,0],[0,8,0],
  ];
  const fpTop: Vec3[] = fp.map(([x,y]) => [x, y, height] as Vec3);

  const faces: SolidFace[] = [];

  // Floor: normal -Z
  faces.push({ polygon: [...fp].reverse(), tags: { type: "floor" } });

  // Top: normal +Z
  faces.push({ polygon: [...fpTop], tags: { type: "top" } });

  // Walls
  for (let i = 0; i < fp.length; i++) {
    const j = (i + 1) % fp.length;
    faces.push({
      polygon: [fp[i], fp[j], fpTop[j], fpTop[i]],
      tags: { type: "wall", edge: i },
    });
  }

  return faces;
}

// ── Geometry helpers ────────────────────────────────────────

function totalArea(faces: SolidFace[]): number {
  return faces.reduce((sum, f) => sum + newell(f.polygon).area, 0);
}

// ── Tests ───────────────────────────────────────────────────

describe("clipSolid — box clipped by horizontal plane", () => {
  // 10×6×5 box, clip at z=3
  const box = makeBox(0, 0, 0, 10, 6, 5);
  const plane: Plane = { n: [0, 0, 1], d: 3 }; // keep z <= 3
  const result = clipSolid(box, plane);

  it("produces 6 faces (still a box)", () => {
    expect(result).toHaveLength(6);
  });

  it("new top face is at z=3 with area 60", () => {
    const topFaces = result.filter(
      (f) => f.tags.source === "cut" || (f.tags.type === "top"),
    );
    // The original top at z=5 is removed; the cap at z=3 replaces it
    expect(topFaces).toHaveLength(1);
    const area = newell(topFaces[0].polygon).area;
    expect(area).toBeCloseTo(60, 1);
  });

  it("floor face unchanged at z=0", () => {
    const floors = result.filter((f) => f.tags.type === "floor");
    expect(floors).toHaveLength(1);
    for (const v of floors[0].polygon) {
      expect(v[2]).toBeCloseTo(0);
    }
  });

  it("wall faces are clipped to z=0..3 height", () => {
    const walls = result.filter((f) => f.tags.type === "wall");
    expect(walls).toHaveLength(4);
    for (const w of walls) {
      const zs = w.polygon.map((v) => v[2]);
      expect(Math.min(...zs)).toBeCloseTo(0);
      expect(Math.max(...zs)).toBeCloseTo(3);
    }
  });

  it("passes assertClosed", () => {
    assertClosed(result, "box clipped z=3");
  });
});

describe("clipSolid — 45° plane through a box", () => {
  // 10×6×5 box, cut by plane z <= x (45° rising from x=0)
  // Plane: z - x <= 0 → n=(−1,0,1)/√2, d=0
  const box = makeBox(0, 0, 0, 10, 6, 5);
  const sq2 = Math.sqrt(2);
  const plane: Plane = { n: [-1 / sq2, 0, 1 / sq2], d: 0 };
  const result = clipSolid(box, plane);

  it("cap is a rectangle 6 wide × 5√2 long", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    expect(caps).toHaveLength(1);
    const area = newell(caps[0].polygon).area;
    // The cap cuts from (0,*,0) to (5,*,5): a 6-wide by 5√2-long rectangle
    expect(area).toBeCloseTo(6 * 5 * sq2, 1);
  });

  it("floor face is unchanged (z=0 plane is fully kept)", () => {
    const floors = result.filter((f) => f.tags.type === "floor");
    expect(floors).toHaveLength(1);
    expect(newell(floors[0].polygon).area).toBeCloseTo(60, 1);
  });

  it("passes assertClosed", () => {
    assertClosed(result, "box 45° plane");
  });
});

describe("clipSolid — plane missing the solid (no-op)", () => {
  // Clip at z=10 but box only goes to z=5 → nothing removed
  const box = makeBox(0, 0, 0, 10, 6, 5);
  const plane: Plane = { n: [0, 0, 1], d: 10 };
  const result = clipSolid(box, plane);

  it("returns all 6 faces unchanged", () => {
    expect(result).toHaveLength(6);
  });

  it("passes assertClosed", () => {
    assertClosed(result, "plane miss");
  });
});

describe("clipSolid — plane below solid (everything removed)", () => {
  // Clip at z=-1 → everything removed
  const box = makeBox(0, 0, 0, 10, 6, 5);
  const plane: Plane = { n: [0, 0, 1], d: -1 };
  const result = clipSolid(box, plane);

  it("returns 0 faces", () => {
    expect(result).toHaveLength(0);
  });
});

describe("clipSolid — L-prism clipped by steep plane", () => {
  // L-prism height=5, clip by a plane that crosses one wing
  // Plane: keep y <= 6 (cuts the upper part of the L)
  // Actually, let's use a tilted plane for a more interesting test
  // Plane: z <= 3 + 0.5*(y-0) → z - 0.5y <= 3 → n=(-0, -0.5, 1)/|n|, d=3/|n|
  // This rises from z=3 at y=0 to z=7 at y=8
  // At the lower rectangle (y=0..4), z ranges 3..5 → clips walls
  // At the upper rectangle (y=4..8), z ranges 5..7 → fully kept (prism is height 5)
  const prism = makeLPrism(5);
  const mag = Math.sqrt(0.25 + 1); // √1.25
  const plane: Plane = { n: [0, -0.5 / mag, 1 / mag], d: 3 / mag };
  const result = clipSolid(prism, plane);

  it("produces a cap face", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    expect(caps.length).toBeGreaterThanOrEqual(1);
  });

  it("cap has >= 3 vertices", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    for (const cap of caps) {
      expect(cap.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("passes assertClosed", () => {
    assertClosed(result, "L-prism steep plane");
  });
});

describe("clipSolid — U-prism produces two cap loops", () => {
  // U-prism height=6, clip at z=4 horizontally
  // Since the U is a single connected polygon, horizontal clip at z=4
  // produces a single cap loop (the U shape)
  // To get TWO loops, we need a plane that intersects two disconnected
  // regions of the prism.
  // Better approach: a diagonal plane that only clips the two wings.
  // U footprint: (0,0),(10,0),(10,8),(8,8),(8,2),(2,2),(2,8),(0,8)
  // The two wings are x=0..2 (left) and x=8..10 (right), connected at y=0..2
  // Use a plane: keep z <= 6 - 2*|y-5|  ... too complex.
  // Simpler: horizontal clip at z=4 always gives ONE loop for connected polygon.
  // For TWO loops we need the plane to separate two parts.
  // Use plane: keep y >= 3 side → n=(0,-1,0), d=-3
  // This removes the bottom (y<3) part and keeps the two disconnected wings.
  // Wait, the U's bottom connects the wings — removing y<3 keeps: left wing y=[3,8] and right wing y=[3,8], connected only by... actually they're NOT connected if y<3 is removed (y=2 is the inner bottom).
  // U footprint at z=0 after clipping y>=3:
  // Left wing: roughly (0,3),(0,8),(2,8),(2,3) — rectangle
  // Right wing: roughly (8,3),(8,8),(10,8),(10,3) — rectangle
  // These are disconnected → two cap loops!
  // But wait, the U has inner boundary at y=2. So the clip plane y=3 cuts through
  // the solid in the wings AND the connecting base.
  // Let's try: plane n=(0,1,0), d=3 → keep y<=3
  // This keeps: full base (y=0..2 inner) + partial wings (y=0..3 of each wing)
  // Only 1 connected piece → 1 loop.
  // For two loops, use a vertical plane through x=5 on the U:
  // n=(1,0,0), d=5 → keep x<=5
  // This keeps the left wing fully (x=0..2) and clips the right wing (x=8..10) fully.
  // The bottom (x=0..10, y=0..2) gets clipped at x=5 → still connected to left wing.
  // Result: 1 connected piece. Hmm.
  //
  // The key insight: to get 2 cap loops, the plane must intersect the solid
  // in two disconnected cross-sections. For a U shape, a horizontal plane
  // at the right height works if we have walls at different heights... but our
  // prism is uniform height.
  //
  // Actually, re-reading the plan: "e.g. one plane shaving two wings of a U-shaped prism"
  // This means a tilted plane that only intersects the two tall wings but NOT the
  // connecting base (which is shorter after being clipped below).
  //
  // Let me use a different approach: make the U shape where the connecting bottom
  // is thin, then use a tilted plane.
  //
  // Or simpler: first clip the U to remove the top half of the wings, then
  // the second clip will produce two loops. But the test should show it in a
  // single clip.
  //
  // Let me just use a plane that passes above the connecting bar but through
  // the wings. The U is: bottom bar at y=0..2 (full width x=0..10),
  // left wing x=0..2 (y=2..8), right wing x=8..10 (y=2..8).
  //
  // A plane z <= 3 clips the wings (height 6 → clipped at z=3).
  // The bottom bar (y=0..2, x=0..10) is also clipped at z=3.
  // This still gives one connected cap (the full U at z=3).
  //
  // For two SEPARATE loops I need the plane to miss the connecting part.
  // Use a tilted plane that's below the bar at z=3 but above z=6 at the wings.
  // E.g., z <= 2 + 2*(y-2) for y>2, z <= 2 for y<=2
  // That's a plane tilted in y: z - 2y <= -2 → n=(0,-2,1)/√5, d=-2/√5
  // At y=0: z <= -2 → below floor → everything removed in that range
  // That removes the bottom bar completely.
  //
  // Actually let me think differently. After a first horizontal cut at z=3:
  // we get a U-shaped solid from z=0 to z=3. Still one piece.
  // After a tilted cut (z rises with y), the cap crosses the two wings
  // at different y positions. Still one continuous cap if the bottom connects them.
  //
  // The TRUE way to get two cap loops: the plane must slice through the solid
  // such that the intersection is two disjoint cross-sections. For a U-prism,
  // this means the plane must pass ABOVE the connecting bottom bar.
  //
  // A plane: z <= 4. The U has uniform height 6. The bar (y=0..2) gets clipped at z=4.
  // The wings get clipped at z=4. Still one connected U-shaped cap. :(
  //
  // Two disjoint loops only happen if the solid itself has a hole or if
  // the intersection creates disconnected patches. For a simply-connected solid
  // like a U-prism, a single plane can only create ONE cap loop (the cross-section
  // of a simply connected solid is simply connected).
  //
  // Wait... the plan says "Multiple disjoint cap loops ARE possible (e.g. one plane
  // shaving two wings of a U-shaped prism)." I think the scenario is:
  // The prism is U-shaped, and a nearly horizontal plane at a certain z height
  // intersects both wings but NOT the connecting bar because the bar is shorter.
  //
  // That requires the prism to have variable height! But our prism is uniform.
  // So: first apply a cut that removes the top of the bar, THEN the next cut
  // would produce two loops.
  //
  // For the test, let me do a two-step clip:
  // 1. Clip U-prism at z <= 2 + 3*max(0, (y-2)/6) — tilted to only clip wings
  // Actually this is getting complicated. Let me just make a prism where the
  // bar is shorter. I'll build it manually.

  // Alternative approach: two separate boxes (not connected at all)
  // and clip them both with one plane. But clipSolid takes a single solid.
  // The plan says holes are impossible, but multiple disjoint cap loops are.
  // This happens when the plane intersects a non-convex solid in disconnected patches.
  //
  // For a U-prism: the plane would need to intersect it where the U splits.
  // A tilted plane in x direction: the plane is steep enough to go below z=0
  // in the center but above z=0 on the sides.
  // Plane: z <= 5 - |x-5| ← this is a V shape, not a plane.
  //
  // A single plane CANNOT create two disjoint loops from a simply-connected solid.
  // BUT: after a PREVIOUS clip, the solid may no longer be simply connected in
  // a topological sense—wait, it's still simply connected, just non-convex.
  //
  // Actually, let me reconsider. A plane CAN create two disjoint cross-section
  // loops from a non-convex solid. Consider the U-prism and a horizontal plane
  // at z = height - 0.1. This clips the very top off, creating a U-shaped cap.
  // That's still one loop.
  //
  // What about a plane that's tilted so it only clips the tops of the wings
  // but passes ABOVE the bottom bar entirely?
  // U: left wing x=0..2, y=0..8; right wing x=8..10, y=0..8; bar y=0..2, x=2..8
  // Height = 6.
  // Plane: z <= 6 - 0.5 * max(0, y-2). At y=2: z<=6 (no clip). At y=8: z<=3.
  // This clips the upper parts of both wings (y>2) but not the bar (y<=2).
  // The bar's top face is fully kept.
  // The cap would be two separate rectangles: one on each wing at their clipped heights.
  // YES! This produces two disjoint cap loops.
  //
  // But I can't express "max(0, y-2)" as a single plane. A plane is linear.
  // z <= 6 - 0.5*(y-2) → z <= 7 - 0.5y → n=(0,-0.5,1)/|n|, d=7/|n|
  // At y=0: z<=7 (above prism → no clip at bar)
  // At y=2: z<=6 (exactly at top → no clip)
  // At y=8: z<=3 (clips both wings)
  // The bar at y=0..2 has top at z=6. Plane allows z<=7..6 there → fully kept.
  // Left wing at y=2..8 has top at z=6. Plane allows z<=6..3 → clips for y>2.
  // Right wing same.
  // The clip intersects BOTH wings, creating intersection lines on both.
  // But the bar top is fully kept, so no intersection there.
  // Cap loops: one for left wing cross-section, one for right wing cross-section.
  // Two loops! Perfect.

  const prism = makeUPrism(6);
  const mag = Math.sqrt(0.25 + 1); // √1.25
  // Keep region: 0.5y + z <= 7.  At y=0,z=6: 6<=7 (kept). At y=2,z=6: 7<=7 (ON).
  // At y=8,z=6: 10>7 (OUT). Clips tops of both wings but not the bar.
  const plane: Plane = { n: [0, 0.5 / mag, 1 / mag], d: 7 / mag };
  const result = clipSolid(prism, plane);

  it("produces exactly 2 cap faces", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    expect(caps).toHaveLength(2);
  });

  it("each cap has >= 3 vertices", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    for (const cap of caps) {
      expect(cap.polygon.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("passes assertClosed", () => {
    assertClosed(result, "U-prism two loops");
  });
});

describe("clipSolid — ON-vertex case", () => {
  // Plane passes exactly through an existing vertex of the box
  // Box: 0..10, 0..6, 0..5
  // Plane: x + z <= 10 → at vertex (10,*,0) → ON, at vertex (0,*,5) → ON
  // n=(1,0,1)/√2, d=10/√2
  const box = makeBox(0, 0, 0, 10, 6, 5);
  const sq2 = Math.sqrt(2);
  const plane: Plane = { n: [1 / sq2, 0, 1 / sq2], d: 10 / sq2 };
  const result = clipSolid(box, plane);

  it("handles ON vertices without crashing", () => {
    expect(result.length).toBeGreaterThan(0);
  });

  it("passes assertClosed", () => {
    assertClosed(result, "ON-vertex");
  });
});

describe("planeFromCut", () => {
  it("produces correct plane for a simple eaves-along-x cut", () => {
    // Eaves line along x-axis (a=(0,0), b=(10,0)), roof rises to left (toward +y)
    // side='left': inward = (-dir.y, dir.x) = (0, 1) (toward +y)
    // With pitch=45°: tan(45°) = 1
    // Keep: z - 1*dot(p.xy - a, inward) <= wallTopZ
    // z - y <= wallTopZ → n=(0,-1,1)/√2, d=wallTopZ/√2
    const cut: RoofCut = { id: "c1", a: [0, 0], b: [10, 0], side: "left", pitch: 45 };
    const plane = planeFromCut(cut, 2.4);

    // Check that a point on the eaves line at wallTopZ is ON the plane
    const eavesPoint: Vec3 = [5, 0, 2.4];
    const dist = dot(plane.n, eavesPoint) - plane.d;
    expect(Math.abs(dist)).toBeLessThan(1e-6);

    // A point above the plane (high z, low y) should be OUT (dist > 0)
    const abovePoint: Vec3 = [5, 0, 10];
    const distAbove = dot(plane.n, abovePoint) - plane.d;
    expect(distAbove).toBeGreaterThan(0);

    // A point under the roof slope should be IN (dist < 0)
    const underPoint: Vec3 = [5, 3, 2.4]; // at y=3, roof is at 2.4+3=5.4, so z=2.4 is under
    const distUnder = dot(plane.n, underPoint) - plane.d;
    expect(distUnder).toBeLessThan(0);
  });

  it("side='right' flips the inward direction", () => {
    // Same eaves line, but rising to the right (toward -y)
    const cutL: RoofCut = { id: "c1", a: [0, 0], b: [10, 0], side: "left", pitch: 35 };
    const cutR: RoofCut = { id: "c2", a: [0, 0], b: [10, 0], side: "right", pitch: 35 };
    const planeL = planeFromCut(cutL, 2.4);
    const planeR = planeFromCut(cutR, 2.4);

    // The inward directions should be opposite in Y
    // planeL.n should have a negative y component (rises toward +y)
    // planeR.n should have a positive y component (rises toward -y)
    expect(Math.sign(planeL.n[1])).not.toBe(Math.sign(planeR.n[1]));
  });

  it("eavesZ overrides wallTopZ", () => {
    const cut: RoofCut = { id: "c1", a: [0, 0], b: [10, 0], side: "left", pitch: 45, eavesZ: 1.0 };
    const plane = planeFromCut(cut, 2.4);

    // Point on eaves at eavesZ should be ON the plane
    const p: Vec3 = [5, 0, 1.0];
    const dist = dot(plane.n, p) - plane.d;
    expect(Math.abs(dist)).toBeLessThan(1e-6);
  });

  it("throws for coincident a and b", () => {
    const cut: RoofCut = { id: "c1", a: [5, 5], b: [5, 5], side: "left", pitch: 35 };
    expect(() => planeFromCut(cut, 2.4)).toThrow("coincident");
  });

  it("clamps pitch to [1, 89.9]", () => {
    const cut0: RoofCut = { id: "c1", a: [0, 0], b: [10, 0], side: "left", pitch: 0 };
    const plane0 = planeFromCut(cut0, 2.4);
    // Should not throw, pitch clamped to 1
    expect(plane0.n).toBeDefined();

    const cut90: RoofCut = { id: "c2", a: [0, 0], b: [10, 0], side: "left", pitch: 90 };
    const plane90 = planeFromCut(cut90, 2.4);
    // Should not throw, pitch clamped to 89.9
    expect(plane90.n).toBeDefined();
  });
});

describe("clipSolid — dual-pitch via two opposing planeFromCut cuts", () => {
  // 10×6 box, height 2.4+12=14.4 (simulating wallTopZ=2.4 with headroom=12)
  // Two cuts along the 10m edges, each at pitch 35°, creating a dual-pitch roof
  const box = makeBox(0, 0, 0, 10, 6, 14.4);

  const cut1: RoofCut = { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 };
  const cut2: RoofCut = { id: "north", a: [10, 6], b: [0, 6], side: "left", pitch: 35 };

  const plane1 = planeFromCut(cut1, 2.4);
  const plane2 = planeFromCut(cut2, 2.4);

  const after1 = clipSolid(box, plane1);
  const result = clipSolid(after1, plane2);

  it("produces two roof (cut) faces", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    expect(caps).toHaveLength(2);
  });

  it("both roof faces have tilt ≈ 35°", () => {
    const caps = result.filter((f) => f.tags.source === "cut");
    for (const cap of caps) {
      const { normal } = newell(cap.polygon);
      // tilt = acos(|nz|)
      const tilt = Math.acos(Math.abs(normal[2])) * 180 / Math.PI;
      expect(tilt).toBeCloseTo(35, 0);
    }
  });

  it("no top face survives", () => {
    const tops = result.filter((f) => f.tags.type === "top");
    expect(tops).toHaveLength(0);
  });

  it("passes assertClosed", () => {
    assertClosed(result, "dual-pitch cuts");
  });
});

describe("assertClosed invariant on raw primitives", () => {
  it("box passes assertClosed", () => {
    assertClosed(makeBox(0, 0, 0, 10, 6, 5), "raw box");
  });

  it("L-prism passes assertClosed", () => {
    assertClosed(makeLPrism(5), "raw L-prism");
  });

  it("U-prism passes assertClosed", () => {
    assertClosed(makeUPrism(6), "raw U-prism");
  });
});

describe("chainLoops", () => {
  it("chains a triangle from 3 segments", () => {
    const segments: [Vec3, Vec3][] = [
      [[0,0,0],[1,0,0]],
      [[1,0,0],[0.5,1,0]],
      [[0.5,1,0],[0,0,0]],
    ];
    const loops = chainLoops(segments);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(3);
  });

  it("chains two disjoint loops", () => {
    const segments: [Vec3, Vec3][] = [
      [[0,0,0],[1,0,0]],
      [[1,0,0],[0,1,0]],
      [[0,1,0],[0,0,0]],
      [[5,5,5],[6,5,5]],
      [[6,5,5],[5,6,5]],
      [[5,6,5],[5,5,5]],
    ];
    const loops = chainLoops(segments);
    expect(loops).toHaveLength(2);
  });

  it("flips segments as needed", () => {
    // All segments reversed except first
    const segments: [Vec3, Vec3][] = [
      [[0,0,0],[1,0,0]],
      [[0.5,1,0],[1,0,0]], // reversed
      [[0,0,0],[0.5,1,0]], // reversed
    ];
    const loops = chainLoops(segments);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(3);
  });
});

describe("orientLoop", () => {
  it("does not reverse a correctly oriented loop", () => {
    // Triangle in XY plane with normal +Z
    const loop: Vec3[] = [[0,0,5],[1,0,5],[0,1,5]];
    const n: Vec3 = [0, 0, 1];
    const result = orientLoop(loop, n);
    // newell of CCW triangle in XY gives +Z normal → same direction as n → no reverse
    expect(result[0]).toEqual(loop[0]);
  });

  it("reverses a wrongly oriented loop", () => {
    // CW triangle in XY plane → normal is -Z
    const loop: Vec3[] = [[0,0,5],[0,1,5],[1,0,5]];
    const n: Vec3 = [0, 0, 1];
    const result = orientLoop(loop, n);
    // Should be reversed so normal matches +Z
    const { normal } = newell(result);
    expect(dot(normal, n)).toBeGreaterThan(0);
  });
});
