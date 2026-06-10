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
| `types.ts` | All interfaces: Vec2/Vec3, BuildingSpec/Mass/Storey/Roof/Opening/Component/EdgeAdjacency, Face/FaceTag/FaceOpening/HalfEdge/FaceModel, Schedule/SurfaceRow/OpeningRow/JunctionRow/Totals |
| `geometry.ts` | snap/snapVec3, cross/dot/sub/length/normalize, shoelace/isCCW/ensureCCW, newell (area+normal), azimuthOf/tiltOf, dist3, perimeter2D |
| `solve.ts` | `solve(spec)` = `extract(resolve(spec), northAngle)` |
| `index.ts` | Public API re-exports |

### Resolve pipeline (`src/resolve/`)

| File | Function | Output |
|---|---|---|
| `index.ts` | `resolve(spec)` | Orchestrates: walls → floor → roof → openings → topology |
| `walls.ts` | `extrudeWalls(mass, massId)` | Wall faces per edge per storey. Winding: `[A_bot, B_bot, B_top, A_top]` |
| `floor.ts` | `buildFloor(mass, massId)` | Single floor face at z=0, normal -Z |
| `roof.ts` | `buildRoof(mass, massId)` | Roof faces: flat/mono/dual/hip. Gable wall triangles for mono/dual |
| `openings.ts` | `placeOpenings(faces, mass, massId)` | Mutates faces array, adds FaceOpening entries |
| `topology.ts` | `buildTopology(faces)` | Half-edge structure: edge A→B paired with twin B→A |

### Extract pipeline (`src/extract/`)

| File | Function | Output |
|---|---|---|
| `index.ts` | `extract(model, northAngle)` | Aggregates surfaces + openings + junctions + totals |
| `surfaces.ts` | `extractSurfaces(model, northAngle)` | SurfaceRow[] + OpeningRow[]. faceName: `Wall S{s} E{e}`, `Floor`, `Roof P{n}`, `Gable E{e}` |
| `junctions.ts` | `extractJunctions(model)` | JunctionRow[]. Types: external_corner, internal_corner, wall_ground_floor, wall_exposed_floor, roof_flat_wall, eaves, gable, ridge, opening_head, opening_sill, opening_jamb |

### Tests (`test/`)

- `geometry.test.ts` — vector ops, winding, newell, azimuth/tilt
- `phase1.test.ts` — hello-box (4 walls + floor), l-plan (6 walls, corners)
- `phase3.test.ts` — openings (windows, doors, count, multi-storey)
- `phase4.test.ts` — roofs (flat, dual-pitch, hip), roof junctions

### Fixtures (`fixtures/`)

- `hello-box.spec.json` — 10×6, 1 storey 2.4m, flat roof
- `hello-box-window.spec.json` — hello-box + 1 south window
- `hello-box-dual.spec.json` — 10×6, dual-pitch 35°, ridgeEdge 0
- `hello-box-hip.spec.json` — 10×6, hip 35°
- `l-plan.spec.json` — L-shaped 6-edge footprint, flat roof

## Package: viewer (`packages/viewer/`)

React + Three.js viewer. `npm run dev` → Vite on localhost:5173.
- `DropZone.tsx` has inline fixture buttons (hello-box, l-plan, dual-pitch, hip-roof)
- `lib/colors.ts` maps `type:adjacency` → hex color
- `lib/triangulate.ts` uses earcut for polygon triangulation

## Conventions

- **Winding**: footprints CCW (ensureCCW). Wall outward normals via right-hand rule.
- **Coordinate system**: Z-up. North = +Y. Azimuth: N=0°, E=90°, S=180°, W=270°.
- **Snap tolerance**: `SNAP = 1e-4`, `EPS = 1e-6`.
- **Face IDs**: `${massId}_wall_s${si}_e${ei}`, `${massId}_floor`, `${massId}_roof_p${i}`, `${massId}_gable_e${ei}`.
- **FaceTag.type**: `"wall" | "floor" | "roof" | "dormer_front" | "dormer_cheek" | "dormer_roof"`.
- **Run tests**: `cd packages/core && npx vitest run`.
- **No external deps in core** (yet) — only dev deps (vitest, typescript).
