import type { SurfaceRow, OpeningRow, JunctionRow, Totals, Schedule } from "./types.js";

export function surfacesCsv(rows: SurfaceRow[]): string {
  const header = "name,mass,storey,type,adjacency,area,azimuth,tilt";
  const lines = rows.map(
    (r) => `${r.name},${r.mass},${r.storey},${r.type},${r.adjacency},${r.area},${r.azimuth},${r.tilt}`,
  );
  return [header, ...lines].join("\n") + "\n";
}

export function openingsCsv(rows: OpeningRow[]): string {
  const header = "name,host,type,area,azimuth,tilt";
  const lines = rows.map(
    (r) => `${r.name},${r.host},${r.type},${r.area},${r.azimuth},${r.tilt}`,
  );
  return [header, ...lines].join("\n") + "\n";
}

export function junctionsCsv(rows: JunctionRow[]): string {
  const header = "type,length,instances";
  const lines = rows.map(
    (r) => `${r.type},${r.length},${r.instances ?? ""}`,
  );
  return [header, ...lines].join("\n") + "\n";
}

export function totalsCsv(totals: Totals): string {
  const header = "metric,value";
  const lines = Object.entries(totals).map(([k, v]) => `${k},${v}`);
  return [header, ...lines].join("\n") + "\n";
}

export function scheduleCsv(schedule: Schedule): string {
  return [
    "# Surfaces",
    surfacesCsv(schedule.surfaces),
    "# Openings",
    openingsCsv(schedule.openings),
    "# Junctions",
    junctionsCsv(schedule.junctions),
    "# Totals",
    totalsCsv(schedule.totals),
  ].join("\n");
}
