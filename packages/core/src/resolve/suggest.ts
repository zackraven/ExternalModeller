import type { Vec2, CustomRoofFace, Mass } from "../types.js";
import { buildRoof } from "./roof.js";
import { ensureCCW } from "../geometry.js";

/**
 * Convert parametric roof parameters into explicit CustomRoofFace[].
 *
 * Reuses the existing parametric roof builders internally, then extracts
 * the face polygons from the generated Face objects. This avoids duplicating
 * any roof geometry math.
 */
export function suggestRoof(
  footprint: Vec2[],
  params: { type: "flat" | "mono" | "dual" | "hip"; pitch?: number; ridgeEdge?: number },
  wallTopZ: number,
): CustomRoofFace[] {
  // Build a temporary Mass with storeys that produce the given wallTopZ
  const mass: Mass = {
    footprint: ensureCCW(footprint),
    storeys: [{ height: wallTopZ }],
    roof: { type: params.type, pitch: params.pitch, ridgeEdge: params.ridgeEdge },
  };

  const faces = buildRoof(mass, "tmp");

  // Extract only roof-type faces (not gable walls)
  return faces
    .filter(f => f.tag.type === "roof")
    .map(f => ({ polygon: f.vertices }));
}
