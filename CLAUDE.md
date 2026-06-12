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
| `roof.ts` | `buildRoof(mass, massId)` | Roof faces: flat/mono/dual/hip/custom. Gable wall triangles for mono/dual. Custom: user-supplied 3D polygons + auto-derived gable walls |
| `wallTopProfile.ts` | `wallTopProfile(edgeA, edgeB, wallTopZ, roofFaces)` | Intersects wall plane with roof faces to derive gable profile points |
| `suggest.ts` | `suggestRoof(footprint, params, wallTopZ)` | Converts parametric roof → explicit `CustomRoofFace[]` |
| `validateCustomRoof.ts` | `validateCustomRoof(faces, footprint, wallTopZ)` | Planarity, altitude, degenerate, plan coverage checks |
| `components.ts` | `placeComponents(faces, mass, massId)` | Dormers (front/cheek/roof faces) and rooflights on roof planes |
| `openings.ts` | `placeOpenings(faces, mass, massId)` | Mutates faces array, adds FaceOpening entries |
| `abutment.ts` | `detectAbutments(faces)` | Tags shared footprint-edge walls as `"party"` adjacency |
| `occlusion.ts` | `computeOcclusion(faces)` | Cross-mass face occlusion via Sutherland-Hodgman clipping. Sets `face.occludedArea`. Exports `clipPolygon` |
| `clipSolid.ts` | `clipSolid(solid, plane)`, `planeFromCut(cut, wallTopZ)` | Sutherland-Hodgman solid clipping by half-space. Cap faces tagged `{ source: "cut" }` |
| `cutRoof.ts` | `buildCutSolid(mass, massId)` | Cut-plane roof: fixed faces (floor+walls) + clipped headroom prism. Used when `roof.type === "cuts"` |
| `topology.ts` | `buildTopology(faces)` | Half-edge structure: edge A→B paired with twin B→A |

### Extract pipeline (`src/extract/`)

| File | Function | Output |
|---|---|---|
| `index.ts` | `extract(model, northAngle)` | Aggregates surfaces + openings + junctions + totals |
| `surfaces.ts` | `extractSurfaces(model, northAngle)` | SurfaceRow[] + OpeningRow[]. Net area = gross - openings - occluded. faceName: `Wall S{s} E{e}`, `Floor`, `Roof P{n}`, `Gable E{e}`, `Dormer {n} Front/Cheek/Roof` |
| `junctions.ts` | `extractJunctions(model)` | JunctionRow[]. Types: external_corner, internal_corner, wall_ground_floor, wall_exposed_floor, roof_flat_wall, eaves, gable, ridge, valley, opening_head, opening_sill, opening_jamb, party_wall |

### Tests (`test/`)

- `geometry.test.ts` — vector ops, winding, newell, azimuth/tilt
- `phase1.test.ts` — hello-box (4 walls + floor), l-plan (6 walls, corners)
- `phase3.test.ts` — openings (windows, doors, count, multi-storey)
- `phase4.test.ts` — roofs (flat, dual-pitch, hip), roof junctions, valley detection
- `phase5.test.ts` — dormers, rooflights, component placement
- `phase6.test.ts` — multi-mass party walls, abutment detection
- `occlusion.test.ts` — clipPolygon unit tests, church cross-mass occlusion, party skip, single-mass unchanged
- `validation.test.ts` — hand-checked expected values for all 8 fixtures (51 tests)
- `schema.test.ts` — JSON-schema validation: all fixtures pass, invalid specs rejected
- `csv.test.ts` — CSV formatter unit tests
- `wallTopProfile.test.ts` — wall-roof intersection profile computation
- `customRoof.test.ts` — custom roof face generation, gable walls, face IDs
- `suggestRoof.test.ts` — parametric-to-explicit conversion, round-trip equivalence
- `validateCustomRoof.test.ts` — planarity, altitude, degenerate, coverage validation
- `clipSolid.test.ts` — Sutherland-Hodgman solid clipping (36 tests)
- `cutEquivalence.test.ts` — cut-based vs parametric schedule equivalence (3 tests)
- `cutFixtures.test.ts` — saltbox, half-hip, mansard fixture validation (25 tests)
- `cutJunctions.test.ts` — cut-roof junction sanity (8 tests)
- `cutDormer.test.ts` — rooflight on cut-roof slopes (5 tests)
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
- `hello-box-custom-dual.spec.json` — hello-box dual-pitch expressed as custom roof faces
- `box-saltbox.spec.json` — 10×6, 2 cuts: south 45°, north 25° (asymmetric dual)
- `box-halfhip.spec.json` — 10×6, 4 cuts: south/north 35° + east/west 35° with eavesZ offset (half-hip)
- `box-mansard.spec.json` — 10×6, 4 cuts: lower 70° + upper 25° with eavesZ break (mansard)

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
- **Run tests**: `cd packages/core && npx vitest run`.
- **Type-check viewer**: `cd packages/viewer && npx tsc --noEmit`.
- **Deps**: core has `polygon-clipping` (runtime), `ajv`/`@types/node`/`vitest`/`typescript` (dev).

## Completed phases

- **Phases 0–3**: geometry engine, walls, floor, openings
- **Phase 4**: roof generation (flat/mono/dual/hip)
- **Phase 5**: dormers and rooflights
- **Phase 6**: multi-mass abutment detection, party wall junctions, cross-mass face occlusion
- **Phase 7**: validation suite (hand-checked expected values for all fixtures), SPEC.md, JSON schema
- **Phase 8**: CLI (`surface-modeller` bin) and CSV export

### Studio Phase 3 — Explicit roof representation (core)

`type: "custom"` in `Roof` spec allows user-supplied 3D face polygons instead of parametric generation. `suggestRoof()` converts parametric params (flat/mono/dual/hip) into explicit `CustomRoofFace[]` as a starting point. `wallTopProfile()` intersects wall planes with roof faces to derive gable wall profiles. `validateCustomRoof()` checks planarity, altitude, degenerate faces, and plan coverage. Valley junctions are now distinguished from ridges via `cross(n1, n2) · edgeDir` sign. New fixture: `hello-box-custom-dual.spec.json`.

### Studio Phase 0 — Dormer placement decoupled from rectangular faces

`roofPlaneCoords()` in `components.ts` now derives an orthonormal coordinate frame from the face normal (`cross([0,0,1], n)` for eaves direction, `cross(n, uAxis)` for up-slope) instead of relying on vertex ordering (`v[0]→v[1]`, `v[1]→v[2]`). Origin is the centroid of eaves vertices (min-z). This produces identical results for rectangular faces but enables correct dormer/rooflight placement on non-rectangular roof faces (trapezoids, triangles). Flat-face fallback uses vertex-based direction. All 235 tests pass unchanged.

### Studio Phase 3 — Spec import/export

`EditorToolbar.tsx` has Import button (file picker, `.json`) and Export button (downloads `model.spec.json`). `App.tsx` has global paste handler (`ClipboardEvent`) and drag-and-drop on the editor pane. Both validate JSON and dispatch `LOAD_FIXTURE`.

### Studio Phase 4 — Ridge graph roof editor

**Ridge graph** (`ridgeGraph.ts`): `RidgeNode` (id, pos: Vec2, z), `RidgeSegment` (from, to), `RidgeGraph` (nodes, segments). `ridgeGraphFromParametric()` reverse-engineers a ridge graph from `suggestRoof()` output. `facesFromRidgeGraph()` derives `CustomRoofFace[]` using edge-based classification (SLOPE/HIP/GABLE by midpoint projection onto ridge). Non-planar faces are fan-triangulated. `roofPlanLines()` computes hip/valley projection lines for the SVG overlay.

**State**: `MassDesign.ridgeGraph?: RidgeGraph`. When present, `buildSpecFromMasses()` emits `type: "custom"` with faces from `facesFromRidgeGraph()`. Reducer actions: `SET_ROOF_MODE`, `UPDATE_RIDGE_NODE`, `ADD_RIDGE_NODE`, `REMOVE_RIDGE_NODE`, `ADD_RIDGE_SEGMENT`, `REMOVE_RIDGE_SEGMENT`.

**UI**: `PropertyControls` has parametric/custom mode toggle, ridge node z-height inputs. `SvgCanvas` renders ridge segments (gold lines), draggable ridge nodes (gold circles with z-labels), and hip/valley projection lines (gray dashed). `ScheduleSidebar` shows per-face pitch/area/azimuth readouts in custom mode.

**Known issues**: SVG overlay still has visual glitches — the hip/valley lines and ridge node interaction need further polish. Ridge node dragging can produce geometries that cause validation warnings.

### Cut-plane roof system (WO-A through WO-C complete)

**Core engine** (`packages/core/`):

- `src/resolve/clipSolid.ts` — Sutherland-Hodgman solid clipping: `clipSolid(solid, plane)` clips a closed polyhedron by a half-space. Preserves tags on surviving faces, new cap faces get `{ source: "cut" }`. `planeFromCut(cut, wallTopZ)` converts `RoofCut` to `{n, d}` plane.
- `src/resolve/cutRoof.ts` — `buildCutSolid(mass, massId)`: builds floor + storey walls as fixed faces (never clipped), then a headroom prism (wallTopZ to topZ) that gets clipped by each `RoofCut` plane. Replaces extrudeWalls+buildFloor+buildRoof when `mass.roof.type === "cuts"`.
- `src/resolve/index.ts` — `resolve()` dispatches to `buildCutSolid()` when roof type is "cuts".
- `types.ts` — `RoofCut { id, a: Vec2, b: Vec2, side: "left"|"right", pitch: number, eavesZ?: number }`. Roof type union includes `"cuts"`.
- Fixtures: `box-saltbox.spec.json`, `box-halfhip.spec.json`, `box-mansard.spec.json`.
- Tests: `clipSolid.test.ts` (36 tests), `cutEquivalence.test.ts` (3), `cutFixtures.test.ts` (25), `cutJunctions.test.ts` (8), `cutDormer.test.ts` (5). Total core tests: 389.

**Studio UI** (`packages/studio/`):

- `lib/types.ts` — `MassDesign.roofCuts?: RoofCut[]`, `RoofConfig.type` includes `"cuts"`.
- `lib/reducer.ts` — Actions: `ADD_CUT`, `UPDATE_CUT`, `DELETE_CUT`. `massDesignsFromSpec` loads cuts from spec.
- `lib/specFromVertices.ts` — Emits `{type:'cuts', cuts}` when `roofCuts` present.
- `components/SvgCanvas.tsx` — Purple cut lines on canvas: draggable endpoints, perpendicular rising-side ticks, pitch labels, two-click add-cut tool, ESC/Delete keyboard shortcuts.
- `components/PropertyControls.tsx` — Per-cut controls (pitch, eavesZ, side flip, delete). One-click Dual and Hip preset buttons.
- `components/ScheduleSidebar.tsx` — UNCUT_TOP red warning banner, per-face pitch/area/azimuth readouts in cuts mode.

**Run studio**: `cd packages/studio && npm run dev` → Vite on localhost:5181.
**Run studio type-check**: `cd packages/studio && npx tsc --noEmit`.

**WO-D progress** (in progress):
- WO-D.1 DONE: `crossMassRoof.test.ts` — 13 tests (catslide + side-by-side multi-mass cut roofs, party wall detection, occlusion). Total core tests: 402.
- WO-D.2 DONE: "Copy cut to mass" button in PropertyControls when abutting mass detected. `abutMasses` prop computed via edge-key matching in ScheduleSidebar.
- WO-D.3 IN PROGRESS: Ridge-graph cleanup — started removing `ridgeGraph` from `types.ts`. Partial edits stashed (`git stash`). Need to delete `ridgeGraph.ts`, its tests, and remove all ridge references from reducer, specFromVertices, SvgCanvas, PropertyControls, ScheduleSidebar.
- WO-D.4 PENDING: Write LIMITATIONS.md.

**Files to delete in WO-D.3**: `src/lib/ridgeGraph.ts`, `src/lib/__tests__/ridgeGraph.test.ts`, `src/lib/__tests__/ridgeDebug.test.ts`. Files to edit: `types.ts` (remove `ridgeGraph` field + import), `reducer.ts` (remove ridge actions + imports), `specFromVertices.ts` (remove `facesFromRidgeGraph` import/usage), `SvgCanvas.tsx` (remove ridge overlay code), `PropertyControls.tsx` (remove ridge node controls + `RidgeGraph` import), `ScheduleSidebar.tsx` (remove `ridgeGraph` checks).
