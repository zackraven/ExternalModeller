import { describe, it, expect } from "vitest";
import { parseWallFaceId } from "../faceIdUtils";

describe("parseWallFaceId", () => {
  it("parses a simple mass id", () => {
    const ref = parseWallFaceId("mass_1_wall_s0_e2");
    expect(ref).toEqual({ massId: "mass_1", storey: 0, edge: 2 });
  });

  it("parses mass id with underscores", () => {
    const ref = parseWallFaceId("my_big_house_wall_s1_e3");
    expect(ref).toEqual({ massId: "my_big_house", storey: 1, edge: 3 });
  });

  it("parses named mass id", () => {
    const ref = parseWallFaceId("nave_wall_s0_e0");
    expect(ref).toEqual({ massId: "nave", storey: 0, edge: 0 });
  });

  it("returns null for floor face", () => {
    expect(parseWallFaceId("mass_1_floor")).toBeNull();
  });

  it("returns null for roof face", () => {
    expect(parseWallFaceId("mass_1_roof_p0")).toBeNull();
  });

  it("returns null for gable face", () => {
    expect(parseWallFaceId("mass_1_gable_e1")).toBeNull();
  });

  it("returns null for dormer face", () => {
    expect(parseWallFaceId("mass_1_dormer_0_front")).toBeNull();
  });
});
