import type { FaceTag } from "@sap-geometry/core";

const COLOR_MAP: Record<string, string> = {
  "wall:external": "#7FAACC",
  "wall:party": "#CC7F8F",
  "wall:internal": "#CCBB7F",
  "wall:unheated": "#AA8FCC",
  "floor:ground": "#8B7355",
  "floor:exposed": "#B8956A",
  "roof:external": "#6B7B8D",
  "dormer_front:external": "#A0522D",
  "dormer_cheek:external": "#B87333",
  "dormer_roof:external": "#8B6914",
};

const FALLBACK = "#888888";

export function faceColor(tag: FaceTag): string {
  const key = `${tag.type}:${tag.adjacency}`;
  return COLOR_MAP[key] ?? FALLBACK;
}

const OPENING_COLOR_MAP: Record<string, string> = {
  window: "#88CCEE",
  door: "#8B6914",
  rooflight: "#AADDFF",
};

export function openingColor(type: string): string {
  return OPENING_COLOR_MAP[type] ?? FALLBACK;
}

export const SELECTED_EMISSIVE = 0xffff44;
