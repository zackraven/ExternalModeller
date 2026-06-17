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
- `crossMassRoof.test.ts` — catslide + side-by-side multi-mass cut roofs, party walls, occlusion (13 tests)
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
- `lib/mergedArea.ts` — `planeKey`, `makeProjection`, `computeMergedGroupInfo` (coplanar face union area), `computeCrossMassOcclusion` (wall/roof volume occlusion via polygon-clipping)
- `components/InfoPanel.tsx` — face detail (gross/occluded/openings/net area, merged combined area), opening detail, schedule totals

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

### Cut-plane roof system (WO-A through WO-D complete)

**Core engine** (`packages/core/`):

- `src/resolve/clipSolid.ts` — Sutherland-Hodgman solid clipping: `clipSolid(solid, plane)` clips a closed polyhedron by a half-space. Preserves tags on surviving faces, new cap faces get `{ source: "cut" }`. `planeFromCut(cut, wallTopZ)` converts `RoofCut` to `{n, d}` plane.
- `src/resolve/cutRoof.ts` — `buildCutSolid(mass, massId)`: builds floor + storey walls as fixed faces (never clipped), then a headroom prism (wallTopZ to topZ) that gets clipped by each `RoofCut` plane. After clipping, computes exposed ceiling via `polygon-clipping.difference(footprint, survivingBase)` — adds flat roof face(s) at wallTopZ where cuts fully removed the headroom, closing any gaps. Replaces extrudeWalls+buildFloor+buildRoof when `mass.roof.type === "cuts"`.
- `src/resolve/index.ts` — `resolve()` dispatches to `buildCutSolid()` when roof type is "cuts".
- `types.ts` — `RoofCut { id, a: Vec2, b: Vec2, side: "left"|"right", pitch: number, eavesZ?: number }`. Roof type union includes `"cuts"`.
- Fixtures: `box-saltbox.spec.json`, `box-halfhip.spec.json`, `box-mansard.spec.json`.
- Tests: `clipSolid.test.ts` (36 tests), `cutEquivalence.test.ts` (3), `cutFixtures.test.ts` (29), `cutJunctions.test.ts` (8), `cutDormer.test.ts` (5), `crossMassRoof.test.ts` (13). Total core tests: 406.

**Studio UI** (`packages/studio/`):

- `lib/types.ts` — `MassDesign.roofCuts?: RoofCut[]`, `MassDesign.headroom?: number`, `DesignState.headroom?: number`, `RoofConfig.type` includes `"cuts"`.
- `lib/reducer.ts` — Actions: `ADD_CUT`, `UPDATE_CUT`, `DELETE_CUT`. `massDesignsFromSpec` loads cuts and headroom from spec.
- `lib/specFromVertices.ts` — Emits `{type:'cuts', cuts, headroom?}` when `roofCuts` present.
- `components/SvgCanvas.tsx` — Purple cut lines on canvas: draggable endpoints, perpendicular rising-side ticks, pitch labels, two-click add-cut tool, ESC/Delete keyboard shortcuts.
- `components/PropertyControls.tsx` — Per-cut controls (pitch, eavesZ, side flip, delete). One-click Dual and Hip preset buttons. Headroom text input (type value, Enter to commit).
- `components/ScheduleSidebar.tsx` — UNCUT_TOP red warning banner, per-face pitch/area/azimuth readouts in cuts mode. Bridges `headroom` through `DesignState` → `handleDesignChange`.

**Run studio**: `cd packages/studio && npm run dev` → Vite on localhost:5181.
**Run studio tests**: `cd packages/studio && npx vitest run`.
**Run studio type-check**: `cd packages/studio && npx tsc --noEmit`.

**WO-D complete:**
- WO-D.1: `crossMassRoof.test.ts` — 13 tests (catslide + side-by-side multi-mass cut roofs, party wall detection, occlusion).
- WO-D.2: "Copy cut to mass" button in PropertyControls when abutting mass detected. `abutMasses` prop computed via edge-key matching in ScheduleSidebar.
- WO-D.3: Ridge-graph cleanup — deleted `ridgeGraph.ts`, `ridgeGraph.test.ts`, `ridgeDebug.test.ts`. Removed all ridge references from types, reducer (6 actions), specFromVertices, SvgCanvas, PropertyControls, ScheduleSidebar.
- WO-D.4: `LIMITATIONS.md` — documents footprint, roof, storey, opening, component, multi-mass, junction, precision, and UI limitations.

**Post-WO-D fixes:**
- **Headroom control**: Text input in PropertyControls (cuts mode). Type value, press Enter to commit. Default 12m. Flows through `DesignState.headroom` → `handleDesignChange` → `UPDATE_MASS` → `buildSpecFromMasses` → core `Roof.headroom`. Lower values create flat-top roofs where cuts don't fully intersect the prism. Integration tests in `specRoundTrip.test.ts` (5 tests).
- **Exposed ceiling fix**: When a cut plane dips below wallTopZ on the far side of the cut line, the headroom prism was fully removed there, leaving a visible hole. Fix: `cutRoof.ts` now computes `polygon-clipping.difference(footprint, survivingHeadroomBase)` after clipping and adds flat roof face(s) at wallTopZ to close gaps. Test: single-cut exposed ceiling in `cutFixtures.test.ts` (4 tests).
- Studio tests: 97 passed. Core tests: 406 passed.

### Cross-mass merged area display and volume occlusion

**Shared utility** (`packages/viewer/src/lib/mergedArea.ts`):

- `planeKey(face)` — plane key using actual normal direction (not canonicalised), so opposite-facing walls get different keys.
- `makeProjection(normal, sampleVertex)` — 2D/3D projection helpers, drops axis most aligned with normal.
- `computeMergedGroupInfo(faces, faceId)` — finds coplanar same-direction faces from different masses, computes polygon union area via `polygon-clipping.union()`. Returns `{ unionArea, faceCount, openingArea }` or null if solo.
- `computeCrossMassOcclusion(faces, faceId)` — computes area hidden by another mass's volume:
  - **Walls/gables**: intersects the wall plane line with each other mass's footprint (`linePolygonSegments`), checks that the mass extends past the wall into the exterior direction (`hasExterior` guard), builds 2D shadow rectangles (`wallShadowPolygons`), unions all shadows, intersects with the face polygon. Handles full and partial width overlap.
  - **Flat faces** (roofs/ceilings): unions all taller mass footprints, intersects with face XY projection.
- Both paths use `intersectFaceWithShadows` which unions shadow polygons first to avoid double-counting across multiple masses.

**Viewer changes** (`packages/viewer/`):

- `BuildingMesh.tsx` — imports `planeKey`/`makeProjection` from `mergedArea`. Groups coplanar same-direction faces from multiple masses into merged union geometries. Wall clipping generalised to handle gable triangles (sort-by-Z for bottom edge, no vertex count guard). Flat roof clipping via `polygon-clipping.difference`.
- `InfoPanel.tsx` — shows "Combined area" for merged face groups, "Gross/Occluded/Net area" for solo faces using `computeCrossMassOcclusion`.

**Studio changes** (`packages/studio/`):

- `ScheduleSidebar.tsx` — same merged/solo display logic as InfoPanel, imports from `@sap-geometry/viewer/lib/mergedArea`.
