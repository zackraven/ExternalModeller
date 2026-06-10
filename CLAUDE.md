# Surface Modeller — Codebase Guide

Monorepo (`packages/*`): **core** (geometry engine) and **viewer** (React+Three.js 3D viewer).

## Pipeline

```
BuildingSpec (JSON) → solve() → Schedule (surfaces, openings, junctions, totals)
                        │
               resolve(spec) → FaceModel {faces, edges (half-edge topology)}
                        │
               extract(model) → Schedule
```

## Package: core (`packages/core/`)

### Key source files (`src/`)

| File | Purpose |
|---|---|
| `types.ts` | All interfaces: Vec2/Vec3, BuildingSpec/Mass/Storey/Roof/Opening/Component/EdgeAdjacency, Face(+occludedArea)/FaceTag/FaceOpening/HalfEdge/FaceModel, Schedule/SurfaceRow/OpeningRow/JunctionRow/Totals |
| `geometry.ts` | snap/snapVec3, cross/dot/sub/length/normalize, shoelace/isCCW/ensureCCW, newell (area+normal), azimuthOf/tiltOf, dist3, perimeter2D |
| `solve.ts` | `solve(spec)` = `extract(resolve(spec), northAngle)` |
| `csv.ts` | CSV formatters: `surfacesCsv`, `openingsCsv`, `junctionsCsv`, `totalsCsv`, `scheduleCsv` |
| `cli.ts` | CLI entry point: `surface-modeller <input.json> [--csv] [-o file]` |
| `index.ts` | Public API re-exports |

### Resolve pipeline (`src/resolve/`)

| File | Function | Output |
|---|---|---|
| `index.ts` | `resolve(spec)` | Orchestrates: walls → floor → roof → components → openings → abutments → occlusion → topology |
| `walls.ts` | `extrudeWalls(mass, massId)` | Wall faces per edge per storey. Winding: `[A_bot, B_bot, B_top, A_top]` |
| `floor.ts` | `buildFloor(mass, massId)` | Single floor face at z=0, normal -Z |
| `roof.ts` | `buildRoof(mass, massId)` | Roof faces: flat/mono/dual/hip. Gable wall triangles for mono/dual |
| `components.ts` | `placeComponents(faces, mass, massId)` | Dormers (front/cheek/roof faces) and rooflights on roof planes |
| `openings.ts` | `placeOpenings(faces, mass, massId)` | Mutates faces array, adds FaceOpening entries |
| `abutment.ts` | `detectAbutments(faces)` | Tags shared footprint-edge walls as `"party"` adjacency |
| `occlusion.ts` | `computeOcclusion(faces)` | Cross-mass face occlusion via Sutherland-Hodgman clipping. Sets `face.occludedArea`. Exports `clipPolygon` |
| `topology.ts` | `buildTopology(faces)` | Half-edge structure: edge A→B paired with twin B→A |

### Extract pipeline (`src/extract/`)

| File | Function | Output |
|---|---|---|
| `index.ts` | `extract(model, northAngle)` | Aggregates surfaces + openings + junctions + totals |
| `surfaces.ts` | `extractSurfaces(model, northAngle)` | SurfaceRow[] + OpeningRow[]. Net area = gross - openings - occluded. faceName: `Wall S{s} E{e}`, `Floor`, `Roof P{n}`, `Gable E{e}`, `Dormer {n} Front/Cheek/Roof` |
| `junctions.ts` | `extractJunctions(model)` | JunctionRow[]. Types: external_corner, internal_corner, wall_ground_floor, wall_exposed_floor, roof_flat_wall, eaves, gable, ridge, opening_head, opening_sill, opening_jamb, party_wall |

### Tests (`test/`)

- `geometry.test.ts` — vector ops, winding, newell, azimuth/tilt
- `phase1.test.ts` — hello-box (4 walls + floor), l-plan (6 walls, corners)
- `phase3.test.ts` — openings (windows, doors, count, multi-storey)
- `phase4.test.ts` — roofs (flat, dual-pitch, hip), roof junctions
- `phase5.test.ts` — dormers, rooflights, component placement
- `phase6.test.ts` — multi-mass party walls, abutment detection
- `occlusion.test.ts` — clipPolygon unit tests, church cross-mass occlusion, party skip, single-mass unchanged
- `validation.test.ts` — hand-checked expected values for all 8 fixtures (51 tests)
- `schema.test.ts` — JSON-schema validation: all fixtures pass, invalid specs rejected (24 tests)
- `csv.test.ts` — CSV formatter unit tests (15 tests)
- `cli.test.ts` — CLI integration tests via subprocess (9 tests)

### Fixtures (`fixtures/`)

- `hello-box.spec.json` — 10×6, 1 storey 2.4m, flat roof
- `hello-box-window.spec.json` — hello-box + 1 south window
- `hello-box-dual.spec.json` — 10×6, dual-pitch 35°, ridgeEdge 0
- `hello-box-hip.spec.json` — 10×6, hip 35°
- `hello-box-dual-dormer.spec.json` — dual-pitch + gable dormer with window
- `l-plan.spec.json` — L-shaped 6-edge footprint, flat roof
- `two-box-party.spec.json` — two 10×6 boxes sharing an edge (party wall)
- `church.spec.json` — nave (20×10, dual 40°) + tower (4×4, 3 storeys, hip 75°), cross-mass occlusion

### Schema & Docs

- `building-spec.schema.json` — JSON Schema (draft-07) for BuildingSpec validation
- `SPEC.md` (repo root) — AI-facing schema reference with examples

## Package: viewer (`packages/viewer/`)

React + Three.js viewer. `npm run dev` → Vite on localhost:5173.
- `DropZone.tsx` has inline fixture buttons (hello-box, l-plan, dual-pitch, hip-roof, dormer-cottage, abutting-boxes, church, two-storey-hip)
- `lib/colors.ts` maps `type:adjacency` → hex color, `openingColor(type)` for opening fills
- `lib/triangulate.ts` uses earcut for polygon triangulation (supports holes for openings)
- `lib/faceGeometry.ts` — `buildFaceGeometry` (with opening holes), `buildOpeningGeometry` (offset overlays)
- `components/FaceMesh.tsx` — renders face + clickable opening overlays
- `components/FaceLabel.tsx` + `OpeningLabel` — HTML overlay labels
- `components/InfoPanel.tsx` — face detail (gross/occluded/openings/net area), opening detail, schedule totals

## Conventions

- **Winding**: footprints CCW (ensureCCW). Wall outward normals via right-hand rule.
- **Coordinate system**: Z-up. North = +Y. Azimuth: N=0°, E=90°, S=180°, W=270°.
- **Snap tolerance**: `SNAP = 1e-4`, `EPS = 1e-6`.
- **Face IDs**: `${massId}_wall_s${si}_e${ei}`, `${massId}_floor`, `${massId}_roof_p${i}`, `${massId}_gable_e${ei}`, `${massId}_dormer_${ci}_front/cheek/roof`.
- **FaceTag.type**: `"wall" | "floor" | "roof" | "dormer_front" | "dormer_cheek" | "dormer_roof"`.
- **Run tests**: `cd packages/core && npx vitest run` (235 tests across 11 files).
- **Type-check viewer**: `cd packages/viewer && npx tsc --noEmit`.
- **Deps**: core has `polygon-clipping` (runtime), `ajv`/`@types/node`/`vitest`/`typescript` (dev).

## Completed phases

- **Phases 0–3**: geometry engine, walls, floor, openings
- **Phase 4**: roof generation (flat/mono/dual/hip)
- **Phase 5**: dormers and rooflights
- **Phase 6**: multi-mass abutment detection, party wall junctions, cross-mass face occlusion
- **Phase 7**: validation suite (hand-checked expected values for all fixtures), SPEC.md, JSON schema
- **Phase 8**: CLI (`surface-modeller` bin) and CSV export
