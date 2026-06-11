# Surface Modeller — Full Project Briefing

## Purpose of This Document

This document is a complete snapshot of the project for handoff to a planning AI. The goal: produce a detailed, actionable development plan to take this from its current state to a production-quality tool. Read this fully before responding. Minimise token usage in your response — be precise, not verbose.

---

## 1. What This Project Is

A browser-based 3D modelling tool for capturing a building's **external thermal envelope** — every wall, floor, roof plane, window, door, and thermal junction — and exporting the data in a format compatible with **SAP 2012** (the UK's Standard Assessment Procedure for energy rating of dwellings).

**The end user is a SAP assessor.** They need to:
1. Model the building's external geometry (walls, roof, floor, openings)
2. Get accurate surface areas, orientations (azimuth), tilts, and thermal junction lengths
3. Export this data to feed into SAP calculation software

**This is NOT a general-purpose CAD tool.** It only needs to model the thermal envelope — the surfaces that separate heated space from outside/unheated space. Interior walls, furniture, services etc. are irrelevant.

The aspirational UX target is **SketchUp-level simplicity** — a user should be able to model any dwelling's envelope quickly and intuitively.

---

## 2. Architecture

Monorepo with npm workspaces. Three packages:

```
surfaceModeller/
├── packages/
│   ├── core/          Geometry engine (pure TypeScript, no UI)
│   ├── viewer/        React + Three.js 3D viewer component (read-only, legacy)
│   └── studio/        Interactive editor UI (new, uses core + viewer components)
```

### Core (`@sap-geometry/core`)
- **Runtime dep**: `polygon-clipping` (for dormer hole subtraction)
- **Dev deps**: `vitest`, `typescript`, `ajv` (schema validation)
- **235 tests** across 11 test files, all passing
- **CLI**: `surface-modeller <input.json> [--csv] [-o file]`
- Fully deterministic: JSON in → Schedule out

### Viewer (`@sap-geometry/viewer`)
- React + Three.js (`@react-three/fiber`, `@react-three/drei`, `earcut`)
- Originally a standalone viewer app with drag-and-drop JSON loading
- Now also consumed by studio as a component library (`BuildingMesh`)

### Studio (`@sap-geometry/studio`)
- React app with 2D SVG drawing canvas + 3D preview + property controls
- **All geometry delegated to core** — studio has zero geometry logic
- Currently draws a single footprint polygon → configures storeys/roof → live 3D preview
- **New and incomplete** — not yet committed to git

---

## 3. Core Engine — What It Does

### Pipeline

```
BuildingSpec (JSON) → resolve(spec) → FaceModel → extract(model) → Schedule
```

**resolve()** generates 3D geometry:
1. `extrudeWalls()` — one rectangular face per footprint edge per storey
2. `buildFloor()` — single face at z=0
3. `buildRoof()` — flat/mono/dual-pitch/hip roof faces + gable wall triangles
4. `placeComponents()` — dormers (front/cheek/roof faces) and rooflights
5. `placeOpenings()` — windows/doors on wall faces
6. `detectAbutments()` — shared edges between masses → party wall tagging
7. `computeOcclusion()` — cross-mass face hiding (Sutherland-Hodgman clipping)
8. `buildTopology()` — half-edge structure for junction extraction

**extract()** produces the SAP-ready schedule:
- **Surfaces**: name, mass, storey, type, adjacency, net area (gross - openings - occluded), azimuth, tilt
- **Openings**: name, host face, type, area, azimuth, tilt
- **Junctions**: type + total length (external_corner, eaves, ridge, party_wall, opening_head/sill/jamb, etc.)
- **Totals**: externalWallNet, window, door, rooflight, roof, floor, party

### Coordinate System
- Z-up. North = +Y. Ground at z=0.
- Azimuth: N=0, E=90, S=180, W=270
- Footprints wound CCW (auto-corrected)
- Snap tolerance: 1e-4

### Roof Generation (current state — the main problem area)

`buildRoof()` in `packages/core/src/resolve/roof.ts`:

- **flat**: horizontal polygon at wall-top height. Works for any footprint shape.
- **mono/dual/hip**: **hardcoded for rectangular (4-vertex) footprints only.** Uses `rectRoofGeometry()` which computes the ridge by offsetting the eaves edge perpendicular by `halfSpan`. This works perfectly for rectangles but produces **hanging edges and overlapping faces** for non-rectangular quads (parallelograms, trapezoids). Non-quad polygons silently get no pitched roof support.
- **dormers**: placed via `roofPlaneCoords()` in `components.ts`, which derives a local coordinate system from roof face vertices. It assumes `v[0]→v[1]` (eaves edge) is perpendicular to `v[1]→v[2]` (up-slope). This is only true for rectangular roof faces.

**A recent attempt to fix this** (replacing `rectRoofGeometry` with a midpoint-based `quadRoofGeometry`) fixed the hanging-edge issue for non-rect quads but broke dormer placement because the roof faces were no longer rectangular, making the coordinate system non-orthogonal. **That attempt was reverted.** The code is back to the original working-for-rectangles-only state.

### What the Tests Cover

| Test file | What it validates |
|---|---|
| `geometry.test.ts` | Vector ops, winding, newell, azimuth/tilt (37 tests) |
| `phase1.test.ts` | Basic walls + floor: hello-box, L-plan (15 tests) |
| `phase3.test.ts` | Window/door openings, counts, multi-storey (21 tests) |
| `phase4.test.ts` | Flat, dual-pitch, hip roofs + junctions (21 tests) |
| `phase5.test.ts` | Dormers, rooflights, component placement (14 tests) |
| `phase6.test.ts` | Multi-mass party walls, abutment detection (10 tests) |
| `occlusion.test.ts` | Cross-mass occlusion, polygon clipping (18 tests) |
| `validation.test.ts` | Hand-checked values for all 8 fixtures (51 tests) |
| `schema.test.ts` | JSON schema validation (24 tests) |
| `csv.test.ts` | CSV formatter correctness (15 tests) |
| `cli.test.ts` | CLI integration via subprocess (9 tests) |

### Fixtures (test buildings)

1. `hello-box` — 10x6m, 1 storey 2.4m, flat roof
2. `hello-box-window` — same + 1 south window
3. `hello-box-dual` — 10x6m, dual-pitch 35 deg, ridgeEdge 0
4. `hello-box-hip` — 10x6m, hip 35 deg
5. `hello-box-dual-dormer` — dual-pitch + gable dormer with window
6. `l-plan` — L-shaped 6-edge footprint, flat roof
7. `two-box-party` — two 10x6 boxes sharing an edge (party wall)
8. `church` — nave (20x10, dual 40 deg) + tower (4x4, 3 storeys, hip 75 deg)

---

## 4. Studio — Current State

### What works
- Draw a polygon footprint on a 2D SVG canvas (click to place vertices, grid+ortho snap)
- Close the polygon, then drag vertices to reshape
- Configure storeys (1-4, height 2.0-6.0m each)
- Select roof type (flat/mono/dual/hip), pitch (15-75 deg), ridge edge
- Real-time 3D preview via Three.js (orbit, zoom, pan)
- Click faces in 3D to inspect: name, type, adjacency, gross/net area, azimuth, tilt
- View schedule totals (wall, floor, roof, window, door, party areas)
- Load 8 preset fixtures
- Toggle face labels overlay

### What's missing or broken
- **Single mass only** — no way to add a second mass (extension, garage, porch)
- **No opening placement** — can't add windows/doors through the UI (only via fixture presets)
- **No dormer/rooflight placement** — same, preset-only
- **No edge adjacency control** — can't mark walls as party/internal/unheated
- **No export** — no CSV or SAP-format export from the studio
- **Roof breaks on non-rectangular footprints** — core limitation (see above)
- **No undo/redo for design changes** — only vertex undo while drawing
- **No save/load** — can't save a project and reload it

---

## 5. The Key Problem: Roof Geometry

The core engine was designed for **spec-driven batch processing** — you write a JSON spec describing a building, and the engine generates exact geometry. This works well for rectangular footprints with standard roof types.

The studio turns this into an **interactive editor** where the user draws arbitrary footprints and expects the roof to look correct. This exposes fundamental limitations:

1. **`rectRoofGeometry` assumes rectangles.** Ridge computation by perpendicular offset from the eaves edge only works when opposite edges are parallel and equal length. Any deviation produces geometry that extends outside the footprint.

2. **Dormer placement assumes rectangular roof faces.** The coordinate system derivation (`roofPlaneCoords`) takes `v[1]-v[0]` as the eaves direction and `v[2]-v[1]` as the up-slope direction. These are only perpendicular for rectangular faces.

3. **Non-quad polygons get no pitched roof at all.** L-shapes, pentagons, etc. can only have flat roofs.

### The user's desired direction

Rather than trying to auto-generate perfect roofs for arbitrary shapes (which is an unsolved problem in computational geometry — see straight skeleton algorithms), **the user wants more manual control**. The auto-generation should provide a reasonable starting point, but the user should be able to:

- Adjust ridge positions
- Edit roof face geometry
- Handle edge cases manually rather than relying on algorithm magic

The exact form of this control is not yet defined. This is where planning input is needed.

---

## 6. SAP 2012 Output Requirements

SAP 2012 needs the following data about a dwelling's thermal envelope. This is what the tool must ultimately produce:

### Surfaces
For each distinct surface element:
- **Type**: external wall, party wall, internal wall, roof, floor
- **Net area** (m2): gross area minus openings minus any occluded area
- **Orientation/azimuth** (degrees): N=0, NE=45, E=90, etc.
- **Tilt** (degrees from horizontal): walls=90, flat roof=0, pitched roof=pitch angle

### Openings
For each window, door, or rooflight:
- **Type**: window, door, rooflight
- **Area** (m2)
- **Orientation** matching the host surface

### Thermal Junctions (linear thermal bridges)
For each junction type:
- **Type**: e.g. external corner, wall-floor, eaves, ridge, lintel, sill, jamb, party wall
- **Total length** (m)

### What the engine already produces
The `Schedule` output from `solve()` maps directly to SAP requirements. The CSV export formats this into tables. The core engine is essentially complete for SAP data extraction — **the gap is the interactive UI to build the model, not the calculation engine.**

---

## 7. Data Flow Summary

```
USER INTERACTION (Studio)
  │
  ├── Draw footprint (SVG canvas) ──→ Vec2[] vertices
  ├── Configure storeys/roof ──────→ DesignState
  ├── (TODO) Place openings ───────→ Opening[]
  ├── (TODO) Add masses ───────────→ Mass[]
  │
  ▼
buildSpec(vertices, design) ──→ BuildingSpec (JSON)
  │
  ▼
resolve(spec) ──→ FaceModel (faces + half-edge topology)
  │
  ├──→ 3D Preview (Three.js)
  │
  ▼
solve(spec) ──→ Schedule (surfaces, openings, junctions, totals)
  │
  ├──→ UI display (sidebar tables)
  └──→ (TODO) CSV/SAP export
```

---

## 8. File Map — What Lives Where

### Core engine (`packages/core/src/`)
```
types.ts              All interfaces (BuildingSpec, Face, Schedule, etc.)
geometry.ts           Vector math, winding, newell, azimuth/tilt
solve.ts              solve(spec) = extract(resolve(spec))
index.ts              Public API re-exports

resolve/
  index.ts            resolve() orchestrator
  walls.ts            Wall face extrusion
  floor.ts            Floor face
  roof.ts             Roof generation (flat/mono/dual/hip) ← PROBLEM AREA
  components.ts       Dormer + rooflight placement ← COUPLED TO ROOF
  openings.ts         Window/door placement on walls
  abutment.ts         Party wall detection
  occlusion.ts        Cross-mass face occlusion
  topology.ts         Half-edge mesh construction

extract/
  index.ts            extract() orchestrator
  surfaces.ts         Surface + opening row extraction
  junctions.ts        Thermal junction extraction

csv.ts                CSV formatters
cli.ts                CLI entry point
```

### Studio (`packages/studio/src/`)
```
App.tsx               Root component, all state management
main.tsx              React entry point

components/
  SvgCanvas.tsx       2D footprint editor (SVG)
  PreviewPanel.tsx    3D viewer (Three.js canvas)
  EditorToolbar.tsx   Toolbar with fixture loader
  ScheduleSidebar.tsx Right panel: controls + schedule display
  PropertyControls.tsx Storey/roof configuration inputs (embedded in sidebar)

hooks/
  useModel.ts         Calls core resolve() + solve(), memoised

lib/
  types.ts            RoofConfig, DesignState interfaces
  constants.ts        Grid step, snap tolerance, close radius
  fixtures.ts         8 preset BuildingSpecs
  specFromVertices.ts Vec2[] + DesignState → BuildingSpec
  verticesFromSpec.ts BuildingSpec → Vec2[] (for fixture loading)
  snap.ts             Grid + ortho snapping
  svgCoords.ts        Pixel → world coordinate conversion
```

### Viewer (`packages/viewer/src/`)
```
App.tsx               Standalone viewer app (drag-and-drop JSON)
components/
  BuildingMesh.tsx    Main 3D mesh renderer (used by studio)
  FaceMesh.tsx        Individual face rendering + click handling
  FaceLabel.tsx       HTML overlay face labels
  Viewer.tsx          Viewer wrapper component
  InfoPanel.tsx       Face/schedule detail panel
  DropZone.tsx        JSON file drop zone
  Toolbar.tsx         Viewer toolbar
  NorthIndicator.tsx  Compass indicator
lib/
  colors.ts           Face type → colour mapping
  faceGeometry.ts     Face mesh construction (with opening holes)
  triangulate.ts      Earcut polygon triangulation
```

---

## 9. What We Want From You

**Design a development plan** to take this project from its current state to a tool where a SAP assessor can:

1. Quickly model any real-world dwelling's thermal envelope
2. Handle common UK dwelling types: detached, semi-detached, terraced, bungalows, extensions, dormers, bay windows, conservatories
3. Get accurate SAP-ready output (areas, orientations, junctions)

### Key constraints
- **User control over roofs is essential.** Auto-generation should provide a starting point but the user needs the ability to adjust. The current "specify type + pitch + ridge edge and hope for the best" approach doesn't work for non-trivial shapes.
- **Multi-mass support in the UI is essential.** Real buildings have extensions, porches, garages. The core already handles multi-mass geometry; the studio needs UI for it.
- **Opening placement needs a UI.** Currently windows/doors can only be added via JSON fixtures.
- **The core engine is largely complete and well-tested.** Don't redesign it unless necessary. Build the UI around it.
- **Keep it simple.** This isn't Revit. A SAP assessor needs to produce an accurate model in minutes, not a photorealistic render.

### What we're NOT asking for
- Interior layout / room modelling
- Materials / U-values (SAP software handles that)
- Structural analysis
- Photorealistic rendering

### Efficiency note
When implementing, we want to **minimise unnecessary token usage**. That means:
- Don't regenerate entire files when a targeted edit suffices
- Don't add speculative features not in the plan
- Don't refactor working code that isn't being changed
- Read files before editing them
- Run tests after changes to catch issues early
- Keep plans specific and actionable — no vague "improve the UX" steps
