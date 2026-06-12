/**
 * Dump schedule output for the three new cut-roof fixtures.
 * Run: npx tsx scripts/dumpFixtures.ts
 */
import { solve } from "../src/solve.js";
import { resolve } from "../src/resolve/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");

for (const name of ["box-saltbox", "box-halfhip", "box-mansard"]) {
  const spec = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, `${name}.spec.json`), "utf8"),
  );
  const schedule = solve(spec);
  const model = resolve(spec);

  console.log(`\n=== ${name} ===`);
  console.log("Faces:");
  for (const f of model.faces) {
    console.log(
      `  ${f.id} type=${f.tag.type} adj=${f.tag.adjacency} area=${f.area.toFixed(6)}`,
    );
    if (f.tag.type === "roof" || f.id.includes("wall_h")) {
      console.log(
        `    verts: ${JSON.stringify(f.vertices.map((v) => v.map((c) => +c.toFixed(4))))}`,
      );
    }
  }
  console.log("Surfaces:");
  for (const s of schedule.surfaces) {
    console.log(
      `  ${s.name} type=${s.type} area=${s.area.toFixed(6)} azi=${s.azimuth.toFixed(1)} tilt=${s.tilt.toFixed(1)}`,
    );
  }
  console.log("Junctions:");
  for (const j of schedule.junctions) {
    console.log(`  ${j.type} len=${j.length.toFixed(6)}`);
  }
  console.log("Totals:", JSON.stringify(schedule.totals));
}
