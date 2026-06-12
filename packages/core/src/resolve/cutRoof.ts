/**
 * cutRoof — builds a closed solid from a mass footprint and storeys,
 * then clips it by each RoofCut to produce walls, floor, and roof faces.
 *
 * Replaces extrudeWalls + buildFloor + buildRoof when mass.roof.type === "cuts".
 */

import type { Mass, Face, Vec3 } from "../types.js";
import { ensureCCW, newell, snapVec3 } from "../geometry.js";
import { clipSolid, planeFromCut } from "./clipSolid.js";
import type { SolidFace } from "./clipSolid.js";

/**
 * Build a cut-based roof: extrude the footprint into a prism with headroom,
 * then clip with each RoofCut plane. Returns Face[] including floor, walls,
 * and roof faces ready for the rest of the resolve pipeline.
 */
export function buildCutSolid(mass: Mass, massId: string): Face[] {
  const footprint = ensureCCW(mass.footprint);
  const nEdges = footprint.length;
  const nStoreys = mass.storeys.length;

  // Compute wallTopZ
  let wallTopZ = 0;
  for (const s of mass.storeys) wallTopZ += s.height;

  const headroom = mass.roof?.headroom ?? 12;
  const topZ = wallTopZ + headroom;
  const cuts = mass.roof?.cuts ?? [];

  // ── Build prism ──────────────────────────────────────────────
  const solid: SolidFace[] = [];

  // Floor: reversed footprint at z=0, normal (0,0,-1)
  const floorPoly: Vec3[] = [...footprint].reverse().map(([x, y]) => [x, y, 0]);
  solid.push({ polygon: floorPoly, tags: { type: "floor" } });

  // Walls per storey per edge
  let zBase = 0;
  for (let si = 0; si < nStoreys; si++) {
    const zTop = zBase + mass.storeys[si].height;
    for (let ei = 0; ei < nEdges; ei++) {
      const a = footprint[ei];
      const b = footprint[(ei + 1) % nEdges];
      // Winding: [A_bot, B_bot, B_top, A_top] — outward normal for CCW footprint
      const poly: Vec3[] = [
        [a[0], a[1], zBase],
        [b[0], b[1], zBase],
        [b[0], b[1], zTop],
        [a[0], a[1], zTop],
      ];
      solid.push({
        polygon: poly,
        tags: { type: "wall", edgeIndex: ei, storey: si },
      });
    }
    zBase = zTop;
  }

  // Headroom bands: wallTopZ to topZ, per edge
  for (let ei = 0; ei < nEdges; ei++) {
    const a = footprint[ei];
    const b = footprint[(ei + 1) % nEdges];
    const poly: Vec3[] = [
      [a[0], a[1], wallTopZ],
      [b[0], b[1], wallTopZ],
      [b[0], b[1], topZ],
      [a[0], a[1], topZ],
    ];
    solid.push({
      polygon: poly,
      tags: { type: "wall", edgeIndex: ei, storey: nStoreys - 1, headroom: true },
    });
  }

  // Top: footprint at topZ, normal (0,0,+1)
  const topPoly: Vec3[] = footprint.map(([x, y]) => [x, y, topZ]);
  solid.push({ polygon: topPoly, tags: { type: "top" } });

  // ── Apply cuts ───────────────────────────────────────────────
  let clipped: SolidFace[] = solid;
  for (const cut of cuts) {
    clipped = clipSolid(clipped, planeFromCut(cut, wallTopZ));
  }

  // ── Classify and convert to Face[] ───────────────────────────
  const faces: Face[] = [];
  let roofIndex = 0;

  for (const sf of clipped) {
    // Snap interpolated vertices to match parametric pipeline precision
    const polygon = sf.polygon.map(snapVec3);
    const { tags } = sf;
    const { area, normal } = newell(polygon);

    if (tags.source === "cut") {
      // Roof face from a cut plane cap
      faces.push({
        id: `${massId}_roof_p${roofIndex++}`,
        vertices: polygon,
        normal,
        area,
        tag: { mass: massId, storey: nStoreys - 1, type: "roof", adjacency: "external" },
        openings: [],
      });
    } else if (tags.type === "top") {
      // Survived top face → flat roof (UNCUT_TOP)
      faces.push({
        id: `${massId}_roof_p${roofIndex++}`,
        vertices: polygon,
        normal,
        area,
        tag: { mass: massId, storey: nStoreys - 1, type: "roof", adjacency: "external" },
        openings: [],
      });
    } else if (tags.type === "wall") {
      const ei = tags.edgeIndex as number;
      const si = tags.storey as number;
      const isHeadroom = !!tags.headroom;

      let adjacency: Face["tag"]["adjacency"] = "external";
      if (!isHeadroom && mass.adjacency) {
        const ovr = mass.adjacency.find((adj) => adj.storey === si && adj.edge === ei);
        if (ovr) adjacency = ovr.type;
      }

      const faceId = isHeadroom
        ? `${massId}_wall_h_e${ei}`
        : `${massId}_wall_s${si}_e${ei}`;

      faces.push({
        id: faceId,
        vertices: polygon,
        normal,
        area,
        tag: { mass: massId, storey: si, type: "wall", adjacency, edge: ei },
        openings: [],
      });
    } else if (tags.type === "floor") {
      faces.push({
        id: `${massId}_floor`,
        vertices: polygon,
        normal,
        area,
        tag: {
          mass: massId,
          storey: 0,
          type: "floor",
          adjacency: mass.floorAdjacency ?? "ground",
        },
        openings: [],
      });
    }
  }

  return faces;
}
