#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { solve } from "./solve.js";
import { scheduleCsv } from "./csv.js";
import type { BuildingSpec } from "./types.js";

const USAGE = `Usage: surface-modeller <input.json> [options]

Options:
  --csv           Output CSV instead of JSON
  -o, --output F  Write to file F instead of stdout
  -h, --help      Show this help`;

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help") || args.length === 0) {
  console.log(USAGE);
  process.exit(0);
}

const csv = args.includes("--csv");

let outputPath: string | undefined;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "-o" || args[i] === "--output") {
    outputPath = args[i + 1];
    if (!outputPath) {
      console.error("Error: -o/--output requires a filename");
      process.exit(1);
    }
    i++; // skip next arg
  }
}

// First positional arg (not a flag and not the value after -o/--output)
const inputPath = args.find((a: string, i: number) => {
  if (a.startsWith("-")) return false;
  // skip if previous arg was -o or --output
  if (i > 0 && (args[i - 1] === "-o" || args[i - 1] === "--output")) return false;
  return true;
});

if (!inputPath) {
  console.error("Error: no input file specified");
  process.exit(1);
}

try {
  const raw = readFileSync(resolve(inputPath), "utf-8");
  const spec: BuildingSpec = JSON.parse(raw);
  const schedule = solve(spec);

  const output = csv ? scheduleCsv(schedule) : JSON.stringify(schedule, null, 2) + "\n";

  if (outputPath) {
    writeFileSync(resolve(outputPath), output, "utf-8");
  } else {
    process.stdout.write(output);
  }
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${msg}`);
  process.exit(1);
}
