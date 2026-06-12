/**
 * Phase 7 — JSON-Schema validation tests
 *
 * Validates all fixture files against building-spec.schema.json,
 * plus checks that intentionally invalid specs are rejected.
 */
import { describe, it, expect, beforeAll } from "vitest";
import Ajv from "ajv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../building-spec.schema.json");
const fixturesDir = path.resolve(__dirname, "../fixtures");

let validate: ReturnType<Ajv["compile"]>;

beforeAll(() => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true });
  validate = ajv.compile(schema);
});

// ── All fixtures must be valid ──────────────────────────────

const fixtureFiles = fs.readdirSync(fixturesDir).filter((f) => f.endsWith(".spec.json"));

describe("Schema — all fixtures valid", () => {
  for (const file of fixtureFiles) {
    it(`${file} passes schema validation`, () => {
      const spec = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), "utf8"));
      const valid = validate(spec);
      if (!valid) {
        // Show errors for debugging
        const msgs = validate.errors!.map((e) => `${e.instancePath} ${e.message}`).join("; ");
        expect.fail(`Schema validation failed: ${msgs}`);
      }
    });
  }
});

// ── Invalid specs must be rejected ──────────────────────────

describe("Schema — rejects invalid specs", () => {
  it("rejects empty object (no masses)", () => {
    expect(validate({})).toBe(false);
  });

  it("rejects empty masses array", () => {
    expect(validate({ masses: [] })).toBe(false);
  });

  it("rejects mass without footprint", () => {
    expect(validate({
      masses: [{ storeys: [{ height: 2.4 }] }],
    })).toBe(false);
  });

  it("rejects mass without storeys", () => {
    expect(validate({
      masses: [{ footprint: [[0, 0], [10, 0], [10, 6], [0, 6]] }],
    })).toBe(false);
  });

  it("rejects footprint with < 3 vertices", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0]],
        storeys: [{ height: 2.4 }],
      }],
    })).toBe(false);
  });

  it("rejects storey with height = 0", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 0 }],
      }],
    })).toBe(false);
  });

  it("rejects storey with negative height", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: -2 }],
      }],
    })).toBe(false);
  });

  it("rejects unknown roof type", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "mansard" },
      }],
    })).toBe(false);
  });

  it("rejects pitch > 90", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "dual", pitch: 95 },
      }],
    })).toBe(false);
  });

  it("rejects negative pitch", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "dual", pitch: -5 },
      }],
    })).toBe(false);
  });

  it("rejects opening with width = 0", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        openings: [{ storey: 0, edge: 0, type: "window", width: 0, height: 1.2 }],
      }],
    })).toBe(false);
  });

  it("rejects unknown opening type", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        openings: [{ storey: 0, edge: 0, type: "skylight", width: 1.0, height: 1.0 }],
      }],
    })).toBe(false);
  });

  it("rejects unknown adjacency type", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        adjacency: [{ storey: 0, edge: 0, type: "shared" }],
      }],
    })).toBe(false);
  });

  it("rejects additional properties on mass", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        color: "red",
      }],
    })).toBe(false);
  });

  it("rejects additional properties at top level", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
      }],
      version: 2,
    })).toBe(false);
  });

  it("rejects opening count < 1", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        openings: [{ storey: 0, edge: 0, type: "window", width: 1.0, height: 1.0, count: 0 }],
      }],
    })).toBe(false);
  });

  it("accepts valid custom roof", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "custom",
          faces: [
            { polygon: [[0, 0, 2.4], [10, 0, 2.4], [10, 3, 4.5], [0, 3, 4.5]] },
            { polygon: [[10, 6, 2.4], [0, 6, 2.4], [0, 3, 4.5], [10, 3, 4.5]] },
          ],
        },
      }],
    })).toBe(true);
  });

  it("rejects custom roof missing faces", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "custom" },
      }],
    })).toBe(false);
  });

  it("rejects custom roof with empty faces array", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "custom", faces: [] },
      }],
    })).toBe(false);
  });

  it("rejects custom roof face with < 3 vertices", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "custom",
          faces: [{ polygon: [[0, 0, 2.4], [10, 0, 2.4]] }],
        },
      }],
    })).toBe(false);
  });

  it("accepts valid cuts roof", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "cuts",
          cuts: [
            { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
            { id: "north", a: [10, 6], b: [0, 6], side: "left", pitch: 35 },
          ],
        },
      }],
    })).toBe(true);
  });

  it("accepts cuts roof with headroom", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "cuts",
          cuts: [
            { id: "south", a: [0, 0], b: [10, 0], side: "left", pitch: 35 },
          ],
          headroom: 8,
        },
      }],
    })).toBe(true);
  });

  it("rejects cuts roof missing cuts array", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "cuts" },
      }],
    })).toBe(false);
  });

  it("rejects cuts roof with empty cuts array", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: { type: "cuts", cuts: [] },
      }],
    })).toBe(false);
  });

  it("rejects cut with pitch < 1", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "cuts",
          cuts: [{ id: "c", a: [0, 0], b: [10, 0], side: "left", pitch: 0.5 }],
        },
      }],
    })).toBe(false);
  });

  it("rejects cut with pitch > 89.9", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "cuts",
          cuts: [{ id: "c", a: [0, 0], b: [10, 0], side: "left", pitch: 90 }],
        },
      }],
    })).toBe(false);
  });

  it("rejects cut missing required fields", () => {
    expect(validate({
      masses: [{
        footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
        storeys: [{ height: 2.4 }],
        roof: {
          type: "cuts",
          cuts: [{ a: [0, 0], b: [10, 0], side: "left", pitch: 35 }],
        },
      }],
    })).toBe(false);
  });
});
