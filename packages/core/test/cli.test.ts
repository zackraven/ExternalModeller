import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, unlinkSync } from "node:fs";
import type { Schedule } from "../src/types.js";

const CLI = resolve(__dirname, "../dist/cli.js");
const FIXTURES = resolve(__dirname, "../fixtures");

function run(args: string[]): { stdout: string; stderr: string; code: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, stderr: "", code: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      code: e.status ?? 1,
    };
  }
}

// ── JSON output ──────────────────────────────────────────────

describe("CLI — JSON output", () => {
  const result = run([`${FIXTURES}/hello-box.spec.json`]);
  const schedule: Schedule = JSON.parse(result.stdout);

  it("exits 0", () => {
    expect(result.code).toBe(0);
  });

  it("parses as valid JSON with expected properties", () => {
    expect(schedule).toHaveProperty("surfaces");
    expect(schedule).toHaveProperty("openings");
    expect(schedule).toHaveProperty("junctions");
    expect(schedule).toHaveProperty("totals");
  });

  it("schedule values match known fixture outputs", () => {
    expect(schedule.surfaces).toHaveLength(6); // 4 walls + floor + roof
    expect(schedule.totals.externalWallNet).toBeCloseTo(76.8, 1);
    expect(schedule.totals.floor).toBeCloseTo(60, 1);
    expect(schedule.totals.roof).toBeCloseTo(60, 1);
  });
});

// ── CSV output ───────────────────────────────────────────────

describe("CLI — CSV output", () => {
  const result = run([`${FIXTURES}/hello-box.spec.json`, "--csv"]);

  it("exits 0", () => {
    expect(result.code).toBe(0);
  });

  it("produces section headers", () => {
    expect(result.stdout).toContain("# Surfaces");
    expect(result.stdout).toContain("# Openings");
    expect(result.stdout).toContain("# Junctions");
    expect(result.stdout).toContain("# Totals");
  });
});

// ── File output ──────────────────────────────────────────────

describe("CLI — file output (-o)", () => {
  const outPath = resolve(__dirname, "../tmp-cli-test-output.json");

  it("writes JSON to file", () => {
    const result = run([`${FIXTURES}/hello-box.spec.json`, "-o", outPath]);
    expect(result.code).toBe(0);

    const content = readFileSync(outPath, "utf-8");
    const schedule: Schedule = JSON.parse(content);
    expect(schedule).toHaveProperty("surfaces");
    expect(schedule.surfaces.length).toBeGreaterThan(0);

    unlinkSync(outPath);
  });
});

// ── Error cases ──────────────────────────────────────────────

describe("CLI — error cases", () => {
  it("missing file → exit 1", () => {
    const result = run(["nonexistent.json"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Error:");
  });

  it("--help → exit 0 with usage text", () => {
    const result = run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("surface-modeller");
  });

  it("no args → exit 0 with usage text", () => {
    const result = run([]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Usage:");
  });
});
