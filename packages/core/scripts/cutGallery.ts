/**
 * cutGallery.ts — generates gallery.html with SVG plan + isometric projections
 * of 12 scripted cut-plane roof cases.
 *
 * Run: npx tsx packages/core/scripts/cutGallery.ts
 * Output: packages/core/scripts/gallery.html
 */

import { writeFileSync } from "fs";
import { resolve } from "path";
import { clipSolid, planeFromCut, type SolidFace, type Plane, type RoofCut } from "../src/resolve/clipSolid.js";
import { newell, dot } from "../src/geometry.js";
import type { Vec2, Vec3 } from "../src/types.js";

// ── Prism builders ──────────────────────────────────────────

function makeBoxPrism(
  w: number, h: number,
  storeyH: number, storeys: number,
  headroom: number,
): { faces: SolidFace[]; wallTopZ: number; footprint: Vec2[] } {
  const wallTopZ = storeyH * storeys;
  const topZ = wallTopZ + headroom;
  const fp: Vec2[] = [[0, 0], [w, 0], [w, h], [0, h]];
  return { faces: buildPrism(fp, topZ), wallTopZ, footprint: fp };
}

function makeLPrism(
  headroom: number,
): { faces: SolidFace[]; wallTopZ: number; footprint: Vec2[] } {
  const wallTopZ = 2.4;
  const topZ = wallTopZ + headroom;
  const fp: Vec2[] = [[0,0],[10,0],[10,4],[4,4],[4,8],[0,8]];
  return { faces: buildPrism(fp, topZ), wallTopZ, footprint: fp };
}

function makeUPrism(
  headroom: number,
): { faces: SolidFace[]; wallTopZ: number; footprint: Vec2[] } {
  const wallTopZ = 2.4;
  const topZ = wallTopZ + headroom;
  const fp: Vec2[] = [[0,0],[10,0],[10,8],[8,8],[8,2],[2,2],[2,8],[0,8]];
  return { faces: buildPrism(fp, topZ), wallTopZ, footprint: fp };
}

function buildPrism(footprint: Vec2[], topZ: number): SolidFace[] {
  const n = footprint.length;
  const bot: Vec3[] = footprint.map(([x, y]) => [x, y, 0]);
  const top: Vec3[] = footprint.map(([x, y]) => [x, y, topZ]);

  const faces: SolidFace[] = [];

  // Floor: normal -Z (reverse winding)
  faces.push({ polygon: [...bot].reverse(), tags: { type: "floor" } });

  // Top: normal +Z
  faces.push({ polygon: [...top], tags: { type: "top" } });

  // Walls
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push({
      polygon: [bot[i], bot[j], top[j], top[i]],
      tags: { type: "wall", edge: i },
    });
  }

  return faces;
}

// ── Apply cuts ──────────────────────────────────────────────

function applyCuts(
  faces: SolidFace[],
  cuts: RoofCut[],
  wallTopZ: number,
): SolidFace[] {
  let result = faces;
  for (const cut of cuts) {
    const plane = planeFromCut(cut, wallTopZ);
    result = clipSolid(result, plane);
  }
  return result;
}

// ── SVG helpers ─────────────────────────────────────────────

/** Pitch angle from horizontal (0..90) for a face polygon. */
function facePitch(polygon: Vec3[]): number {
  const { normal } = newell(polygon);
  const nz = Math.abs(normal[2]);
  return Math.acos(Math.min(1, nz)) * 180 / Math.PI;
}

/** Color by pitch: flat = light blue, steep = dark red. */
function pitchColor(pitch: number): string {
  const t = Math.min(1, pitch / 70); // 0 at flat, 1 at 70°+
  const r = Math.round(60 + 180 * t);
  const g = Math.round(160 - 100 * t);
  const b = Math.round(220 - 180 * t);
  return `rgb(${r},${g},${b})`;
}

/** Check if face is a "cut" cap (roof face). */
function isCutFace(face: SolidFace): boolean {
  return face.tags.source === "cut";
}

/** Check if face is a surviving top face (UNCUT_TOP). */
function isTopFace(face: SolidFace): boolean {
  return face.tags.type === "top";
}

/** Check if face has upward-ish normal (roof or top). */
function isUpwardFace(face: SolidFace): boolean {
  const { normal } = newell(face.polygon);
  return normal[2] > 0.01;
}

// ── Plan view SVG ───────────────────────────────────────────

function planSvg(faces: SolidFace[], footprint: Vec2[], width: number): string {
  // Compute bounds
  const allX = footprint.map(p => p[0]);
  const allY = footprint.map(p => p[1]);
  const minX = Math.min(...allX) - 1;
  const maxX = Math.max(...allX) + 1;
  const minY = Math.min(...allY) - 1;
  const maxY = Math.max(...allY) + 1;

  const rangeX = maxX - minX;
  const rangeY = maxY - minY;
  const scale = width / Math.max(rangeX, rangeY);
  const svgH = Math.max(rangeX, rangeY) * scale;

  const tx = (x: number) => (x - minX) * scale;
  const ty = (y: number) => svgH - (y - minY) * scale; // flip Y

  let svg = `<svg width="${width}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `<rect width="100%" height="100%" fill="#f8f8f8"/>\n`;

  // Draw roof faces (cut caps + surviving tops) projected to plan
  const roofFaces = faces.filter(f => isCutFace(f) || isTopFace(f));
  for (const face of roofFaces) {
    const pitch = facePitch(face.polygon);
    const color = isTopFace(face) ? "#ff4444" : pitchColor(pitch);
    const points = face.polygon.map(([x, y]) => `${tx(x).toFixed(1)},${ty(y).toFixed(1)}`).join(" ");
    svg += `<polygon points="${points}" fill="${color}" stroke="#333" stroke-width="0.5" opacity="0.8"/>\n`;
  }

  // Draw footprint outline
  const fpPoints = footprint.map(([x, y]) => `${tx(x).toFixed(1)},${ty(y).toFixed(1)}`).join(" ");
  svg += `<polygon points="${fpPoints}" fill="none" stroke="#000" stroke-width="1.5"/>\n`;

  // Draw internal ridge/hip/valley lines (edges shared between roof faces at different heights)
  // Find edges that are shared between two roof faces
  const roofEdgeMap = new Map<string, Vec3[][]>();
  for (const face of roofFaces) {
    const poly = face.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const key = [
        Math.min(snapK(a[0], a[1]), snapK(b[0], b[1])),
        Math.max(snapK(a[0], a[1]), snapK(b[0], b[1])),
      ].join("|");
      if (!roofEdgeMap.has(key)) roofEdgeMap.set(key, []);
      roofEdgeMap.get(key)!.push([a, b]);
    }
  }
  for (const [, edges] of roofEdgeMap) {
    if (edges.length >= 2) {
      const [a, b] = edges[0];
      svg += `<line x1="${tx(a[0]).toFixed(1)}" y1="${ty(a[1]).toFixed(1)}" x2="${tx(b[0]).toFixed(1)}" y2="${ty(b[1]).toFixed(1)}" stroke="#c90" stroke-width="1.5"/>\n`;
    }
  }

  svg += `</svg>`;
  return svg;
}

function snapK(x: number, y: number): string {
  return `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
}

// ── Isometric view SVG ──────────────────────────────────────

function isoSvg(faces: SolidFace[], footprint: Vec2[], width: number): string {
  // Isometric projection: x' = x + 0.5*y, y' = -0.4*y - 0.6*z
  const isoX = (v: Vec3) => v[0] + 0.5 * v[1];
  const isoY = (v: Vec3) => -0.4 * v[1] - 0.6 * v[2];

  // Compute bounds
  const allPts: Vec3[] = [];
  for (const f of faces) allPts.push(...f.polygon);
  if (allPts.length === 0) return `<svg width="${width}" height="${width}" xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Empty</text></svg>`;

  const xs = allPts.map(isoX);
  const ys = allPts.map(isoY);
  const minIx = Math.min(...xs) - 1;
  const maxIx = Math.max(...xs) + 1;
  const minIy = Math.min(...ys) - 1;
  const maxIy = Math.max(...ys) + 1;

  const rangeIx = maxIx - minIx;
  const rangeIy = maxIy - minIy;
  const scale = width / Math.max(rangeIx, rangeIy);
  const svgH = Math.max(rangeIx, rangeIy) * scale;

  const tx = (v: Vec3) => (isoX(v) - minIx) * scale;
  const ty = (v: Vec3) => (isoY(v) - minIy) * scale;

  // Sort faces by depth (painter's algorithm): furthest centroid first
  const depthOf = (f: SolidFace) => {
    const c = centroid(f.polygon);
    return -c[1] - c[2]; // sort so far/low faces draw first
  };

  const sorted = [...faces].sort((a, b) => depthOf(a) - depthOf(b));

  let svg = `<svg width="${width}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `<rect width="100%" height="100%" fill="#f0f0f0"/>\n`;

  for (const face of sorted) {
    const { normal } = newell(face.polygon);
    // Back-face cull: skip faces pointing away from viewer
    // Viewer direction roughly: (-0.5, 0.4, 0.6) (inverse of projection weights)
    const viewDot = -0.5 * normal[0] + 0.4 * normal[1] + 0.6 * normal[2];
    if (viewDot < -0.01) continue;

    let color: string;
    if (isCutFace(face)) {
      const pitch = facePitch(face.polygon);
      color = pitchColor(pitch);
    } else if (isTopFace(face)) {
      color = "#ff4444";
    } else if (face.tags.type === "floor") {
      color = "#aaa";
    } else {
      // Wall
      // Shade by normal direction
      const shade = Math.round(180 + 40 * normal[0] + 20 * normal[1]);
      color = `rgb(${shade},${shade},${Math.min(255, shade + 20)})`;
    }

    const points = face.polygon.map(v => `${tx(v).toFixed(1)},${ty(v).toFixed(1)}`).join(" ");
    svg += `<polygon points="${points}" fill="${color}" stroke="#555" stroke-width="0.5" opacity="0.9"/>\n`;
  }

  svg += `</svg>`;
  return svg;
}

function centroid(poly: Vec3[]): Vec3 {
  const n = poly.length;
  let x = 0, y = 0, z = 0;
  for (const [px, py, pz] of poly) { x += px; y += py; z += pz; }
  return [x / n, y / n, z / n];
}

// ── Gallery cases ───────────────────────────────────────────

interface GalleryCase {
  name: string;
  description: string;
  faces: SolidFace[];
  footprint: Vec2[];
}

function buildGallery(): GalleryCase[] {
  const cases: GalleryCase[] = [];

  // Standard 10×6 box, 1 storey 2.4m
  const boxW = 10, boxH = 6, storeyH = 2.4;

  // 1. Mono — single cut along south edge, rising north
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 30 },
    ];
    cases.push({
      name: "1. Mono (30°)",
      description: "Single cut from south edge, pitch 30°",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 2. Symmetric dual — two opposing cuts at 35°
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 35 },
      { id: "north", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 35 },
    ];
    cases.push({
      name: "2. Symmetric Dual (35°)",
      description: "Two opposing cuts at 35°, classic gable",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 3. Asymmetric dual — south 25°, north 45°
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 25 },
      { id: "north", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 45 },
    ];
    cases.push({
      name: "3. Asymmetric Dual (25°/45°)",
      description: "South 25° + North 45° — offset ridge",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 4. Offset-ridge saltbox — south steep 45°, north shallow 15°
  // The steep south slope and shallow north slope create a saltbox silhouette
  // with the ridge strongly offset toward the south
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 45 },
      { id: "north", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 15 },
    ];
    cases.push({
      name: "4. Saltbox (45°/15°)",
      description: "Steep south 45° + shallow north 15° — saltbox, ridge offset toward south",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 5. Rectangular hip — 4 cuts, one per edge
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 35 },
      { id: "north", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 35 },
      { id: "east",  a: [boxW, 0], b: [boxW, boxH], side: "left", pitch: 35 },
      { id: "west",  a: [0, boxH], b: [0, 0], side: "left", pitch: 35 },
    ];
    cases.push({
      name: "5. Hip (4 cuts, 35°)",
      description: "One cut per edge at 35° — hip roof",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 6. Half-hip — hip but end cuts have raised eavesZ
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const halfHipZ = wallTopZ + 1.5; // eaves 1.5m above wall top
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 35 },
      { id: "north", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 35 },
      { id: "east",  a: [boxW, 0], b: [boxW, boxH], side: "left", pitch: 35, eavesZ: halfHipZ },
      { id: "west",  a: [0, boxH], b: [0, 0], side: "left", pitch: 35, eavesZ: halfHipZ },
    ];
    cases.push({
      name: "6. Half-Hip (raised eaves)",
      description: "Hip with end cuts at eavesZ = wallTop + 1.5m",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 7. Mansard — 4 cuts: steep lower (70°) from each edge + shallow upper (25°) inboard
  {
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const kneeInset = 1.5; // knee line 1.5m inboard
    const kneeZ = wallTopZ + kneeInset * Math.tan(70 * Math.PI / 180); // z at knee
    const cuts: RoofCut[] = [
      // Lower steep
      { id: "s-low", a: [0, 0], b: [boxW, 0], side: "left", pitch: 70 },
      { id: "n-low", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 70 },
      // Upper shallow from knee line
      { id: "s-up", a: [0, kneeInset], b: [boxW, kneeInset], side: "left", pitch: 25, eavesZ: kneeZ },
      { id: "n-up", a: [boxW, boxH - kneeInset], b: [0, boxH - kneeInset], side: "left", pitch: 25, eavesZ: kneeZ },
    ];
    cases.push({
      name: "7. Mansard (70°/25°)",
      description: "Steep 70° lower + shallow 25° upper — mansard",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 8. L-prism with single through-cut
  {
    const { faces, wallTopZ, footprint } = makeLPrism(12);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
    ];
    cases.push({
      name: "8. L-prism mono cut",
      description: "L-shaped footprint with single 35° cut from south",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 9. U-prism two-loop case
  {
    const { faces, wallTopZ, footprint } = makeUPrism(12);
    // Tilted plane that clips tops of both wings: keep 0.5y + z <= wallTopZ + 12 - 3
    // Cuts just the upper portion of both wings
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
      { id: "north-l", a: [0, 8], b: [2, 8], side: "right", pitch: 35 },
      { id: "north-r", a: [8, 8], b: [10, 8], side: "right", pitch: 35 },
    ];
    cases.push({
      name: "9. U-prism (multi-cut)",
      description: "U-shaped footprint with cuts on south + both wing tops",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 10. Clipped gable — headroom too low for ridge intersection → flat top strip + UNCUT_TOP
  {
    const lowHeadroom = 1.5; // only 1.5m headroom — not enough for 35° dual to meet
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, lowHeadroom);
    const cuts: RoofCut[] = [
      { id: "south", a: [0, 0], b: [boxW, 0], side: "left", pitch: 35 },
      { id: "north", a: [boxW, boxH], b: [0, boxH], side: "left", pitch: 35 },
    ];
    const result = applyCuts(faces, cuts, wallTopZ);
    const hasUncutTop = result.some(f => f.tags.type === "top");
    cases.push({
      name: `10. Clipped Gable${hasUncutTop ? " [UNCUT_TOP]" : ""}`,
      description: "Headroom 1.5m — ridges can't meet — flat strip remains",
      faces: result,
      footprint,
    });
  }

  // 11. No-op cut — plane entirely above the solid
  // planeFromCut creates an infinite half-space, so we need a plane that
  // keeps ALL points of the solid. Use a very high eavesZ so the plane
  // is well above the prism.
  {
    const topZ = storeyH + 12;
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, 12);
    const cuts: RoofCut[] = [
      { id: "noop", a: [0, 0], b: [boxW, 0], side: "left", pitch: 35, eavesZ: topZ + 50 },
    ];
    cases.push({
      name: "11. No-op cut",
      description: "EavesZ=64.4 (well above prism) — solid unchanged",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  // 12. Pent over half the footprint
  // A single cut from the midline (y=3) sloping down toward the north edge.
  // Uses eavesZ at the headroom top so eaves sit at the ridge height.
  // The south half's top face survives (UNCUT_TOP).
  {
    const headroom = 5;
    const { faces, wallTopZ, footprint } = makeBoxPrism(boxW, boxH, storeyH, 1, headroom);
    const topZ = wallTopZ + headroom;
    const cuts: RoofCut[] = [
      // Eaves at midline (y=3) at topZ, sloping down toward north (y=6)
      // dir = (10,3)→(0,3) = (-1,0). left: inward = (0,-1) → rises toward -y
      // But we want it to slope DOWN toward +y, so the roof rises toward -y.
      // At y=3: z = topZ. At y=6: z = topZ - tan(30°)*3 ≈ topZ - 1.73.
      // South half (y<3) stays fully covered by the top face.
      { id: "pent", a: [boxW, boxH / 2], b: [0, boxH / 2], side: "left", pitch: 30, eavesZ: topZ },
    ];
    cases.push({
      name: "12. Pent (half footprint)",
      description: "30° cut from midline, north half slopes down — south half UNCUT_TOP",
      faces: applyCuts(faces, cuts, wallTopZ),
      footprint,
    });
  }

  return cases;
}

// ── HTML generation ─────────────────────────────────────────

function generateHtml(cases: GalleryCase[]): string {
  const svgWidth = 280;

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Cut-Plane Roof Gallery</title>
<style>
  body { font-family: system-ui, sans-serif; background: #fff; margin: 20px; }
  h1 { margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(600px, 1fr)); gap: 20px; }
  .case { border: 1px solid #ccc; border-radius: 8px; padding: 12px; background: #fafafa; }
  .case h3 { margin: 0 0 4px 0; }
  .case p { margin: 0 0 8px 0; color: #666; font-size: 13px; }
  .views { display: flex; gap: 12px; }
  .view { text-align: center; }
  .view span { display: block; font-size: 11px; color: #999; margin-bottom: 4px; }
  .stats { font-size: 12px; color: #444; margin-top: 6px; }
  .uncut { color: #c00; font-weight: bold; }
</style>
</head>
<body>
<h1>Cut-Plane Roof Gallery</h1>
<p>Generated by <code>cutGallery.ts</code> — ${cases.length} cases</p>
<div class="grid">
`;

  for (const c of cases) {
    const plan = planSvg(c.faces, c.footprint, svgWidth);
    const iso = isoSvg(c.faces, c.footprint, svgWidth);

    const totalFaces = c.faces.length;
    const cutFaces = c.faces.filter(isCutFace).length;
    const topFaces = c.faces.filter(isTopFace).length;
    const wallFaces = c.faces.filter(f => f.tags.type === "wall").length;

    const uncutWarning = topFaces > 0 ? `<span class="uncut">⚠ UNCUT_TOP: ${topFaces} top face(s) survive</span>` : "";

    html += `<div class="case">
  <h3>${c.name}</h3>
  <p>${c.description}</p>
  <div class="views">
    <div class="view"><span>Plan</span>${plan}</div>
    <div class="view"><span>Isometric</span>${iso}</div>
  </div>
  <div class="stats">
    ${totalFaces} faces (${cutFaces} roof, ${wallFaces} wall, ${topFaces} top)
    ${uncutWarning}
  </div>
</div>
`;
  }

  html += `</div>
</body>
</html>`;
  return html;
}

// ── Main ────────────────────────────────────────────────────

const cases = buildGallery();
const html = generateHtml(cases);
const outPath = resolve(import.meta.dirname ?? ".", "gallery.html");
writeFileSync(outPath, html);
console.log(`Wrote ${outPath} with ${cases.length} cases`);
