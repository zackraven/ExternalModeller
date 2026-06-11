import type { Vec2 } from "@sap-geometry/core";

/**
 * Convert client (pixel) coordinates to world (SVG) coordinates,
 * accounting for the Y-flip transform on the content group.
 */
export function clientToWorld(
  clientX: number,
  clientY: number,
  svgEl: SVGSVGElement,
): Vec2 {
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return [0, 0];
  const inv = ctm.inverse();
  const svgX = inv.a * clientX + inv.c * clientY + inv.e;
  const svgY = inv.b * clientX + inv.d * clientY + inv.f;
  // The content group has scale(1,-1), so negate Y to get world coords
  return [svgX, -svgY];
}
