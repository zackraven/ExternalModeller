import type { Mass, Face, Vec3 } from "../types.js";
import { newell, ensureCCW } from "../geometry.js";

export function buildFloor(mass: Mass, massId: string): Face {
  const footprint = ensureCCW(mass.footprint);
  // Reverse winding so normal points down (-Z)
  const reversed = [...footprint].reverse();
  const vertices: Vec3[] = reversed.map(([x, y]) => [x, y, 0]);
  const { area, normal } = newell(vertices);

  return {
    id: `${massId}_floor`,
    vertices,
    normal,
    area,
    tag: {
      mass: massId,
      storey: 0,
      type: "floor",
      adjacency: mass.floorAdjacency ?? "ground",
    },
    openings: [],
  };
}
