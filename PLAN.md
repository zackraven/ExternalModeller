# Surface Modeller — Development Plan

Plan to take the project from current state to a production tool for SAP assessors. Phases are ordered by dependency and user value. Each phase ships independently.

---

## Strategic decisions (read first)

**1. Roofs: explicit geometry as the source of truth, auto-generation as a suggestion.**
Stop treating `type + pitch + ridgeEdge` as the roof definition. Introduce an explicit, editable roof representation in the spec. `suggestRoof()` generates it as a starting point; the user edits it; `resolve()` just consumes it. This matches the stated direction (manual control over algorithm magic) and avoids the straight-skeleton rabbit hole.

**2. Fix dormer placement *before* touching roof generation.**
The reverted `quadRoofGeometry` attempt failed because dormer placement was coupled to rectangular faces, not because the roof math was wrong. Decouple it first (Phase 0) and the roof work stops being booby-trapped.

**3. Multi-mass UI before the roof editor.**
Two abutting rectangular masses with simple dual/hip roofs already model most L-plans, T-plans, extensions, and porches correctly using the *existing, working* rect roof code. Multi-mass UI therefore delivers more assessor value per effort than the roof editor and should ship first.

**4. Don't redesign core.** All changes to core are additive (new spec variant, one frame-derivation fix, one junction type).

---

## Phase 0 — Decouple dormer placement from rectangular faces

**Goal:** `roofPlaneCoords()` works on any planar, non-horizontal roof face.

- `packages/core/src/resolve/components.ts`: replace the vertex-order frame (`v[1]-v[0]`, `v[2]-v[1]`) with a plane-derived frame:
  - `n` = Newell normal of the face
  - `eavesDir = normalize(cross([0,0,1], n))` (horizontal direction in plane)
  - `upSlope = cross(n, eavesDir)`
  - origin = lowest vertex of the face
- Dormer/rooflight placement coordinates become (along-eaves, up-slope) offsets in this frame — same semantics as today for rectangular faces (zero behaviour change), valid for trapezoids/triangles.
- Containment check: verify the dormer footprint (projected into the plane frame) lies inside the face polygon, not inside an assumed rectangle. Use point-in-polygon in plane coordinates; error clearly if it doesn't fit.
- **Tests:** new file `components-frame.test.ts`: (a) rect face produces identical output to current (regression lock via existing phase5 tests), (b) dormer on a trapezoidal face, (c) rooflight on a triangular hip face, (d) out-of-bounds dormer rejected.

Small, low-risk, unblocks everything roof-related.

## Phase 1 — Multi-mass support in studio

**Goal:** model extensions, garages, porches, T/L-plans with the UI.

- `packages/studio/src/lib/types.ts`: `DesignState` becomes `{ masses: MassDesign[]; activeMassId }` with `MassDesign = { id, name, vertices: Vec2[], storeys, roof, openings: [] }`.
- `App.tsx`: migrate state to `useReducer` now (you'll need it for undo/redo in Phase 6 anyway; doing it during this restructure avoids touching the same code twice).
- `SvgCanvas.tsx`:
  - render all masses; active mass editable, others dimmed but visible
  - "Add mass" tool — draws a new footprint
  - **vertex snapping to other masses' edges/vertices** (required: `detectAbutments()` needs genuinely shared edges; snap tolerance must match core's 1e-4 after world-coordinate conversion)
- `ScheduleSidebar.tsx`: mass list (select/rename/delete), per-mass storey + roof controls.
- `specFromVertices.ts` / `verticesFromSpec.ts`: handle `Mass[]`; church and two-box-party fixtures must round-trip.
- 3D preview and schedule already work — core handles multi-mass.
- **Tests:** round-trip tests for multi-mass fixtures through `specFromVertices`/`verticesFromSpec`; manual checklist: semi + rear extension, box + porch.

## Phase 2 — Opening placement UI

**Goal:** add windows/doors without editing JSON.

- Interaction: click a wall face in the 3D preview → sidebar form: type (window/door), width, height, sill height, horizontal position (offset from face edge or "centred"). Live preview on submit (cheap — `resolve()` is already memoised in `useModel`).
- Store openings on `MassDesign.openings`, keyed by `(storeyIndex, edgeIndex)` so they survive footprint edits to *other* edges; if the host edge is deleted, drop them with a toast.
- Sidebar: per-mass openings table with edit/delete.
- 2D canvas: render openings as tick marks on edges (orientation sanity check for the assessor).
- UI-side validation: opening must fit within the host face (mirror core's constraint and clamp/warn before resolve errors).
- Defer drag-to-position-on-face; numeric entry is faster for assessors anyway and SAP only needs area + orientation, so exact position is cosmetic.
- **Tests:** spec generation with openings matches `hello-box-window` fixture; opening on edge that's later deleted is removed cleanly.

## Phase 3 — Explicit roof representation (core)

**Goal:** roofs are data, not just parameters.

- `types.ts`: add a roof variant, recommended shape:
  ```ts
  type RoofSpec =
    | { type: 'flat' | 'mono' | 'dual' | 'hip'; pitch?: number; ridgeEdge?: number }  // existing
    | { type: 'custom'; faces: { polygon: Vec3[] }[] }                                 // new
  ```
- New `suggestRoof(footprint, params): CustomRoof` in `packages/core/src/resolve/suggest.ts`:
  - rectangles → existing `rectRoofGeometry` math, emitted as explicit faces
  - non-rect quads → the midpoint-based `quadRoofGeometry` from the reverted attempt (now safe post-Phase 0)
  - other polygons → flat fallback (user edits from there in Phase 4)
- `resolve/roof.ts`: when `type: 'custom'`, consume faces directly. Keep parametric path for the existing types (fixtures unchanged, zero regression risk).
- **Gable/infill walls:** for custom roofs, derive each wall's top profile by intersecting the wall plane with the roof faces above its footprint edge; extend the wall face up to that profile (replaces the hardcoded gable-triangle logic for the custom path). This is the trickiest part of the phase — write it as a standalone function `wallTopProfile(edge, roofFaces)` with direct unit tests before wiring it in.
- **Validation** (in `resolve`, with clear error messages — the studio surfaces these): each face planar (Newell residual < tol), face boundary edges at wall-top height where they sit over a footprint edge, plan projection of faces covers the footprint within tolerance (reuse `polygon-clipping` for the coverage check).
- `extract/junctions.ts`: add `valley` junction type (sloped concave junction between roof faces) — needed for L-plan roofs. Check `ridge` classification doesn't already swallow it.
- **Tests:** custom roof equivalent of `hello-box-dual` produces identical schedule to parametric; trapezoid quad roof has no hanging edges (assert all roof-face edges either shared, on eaves, or on ridge); L-plan custom roof with valley produces correct valley length (hand-checked); validation rejects non-planar and non-covering inputs.

## Phase 4 — Roof editor (studio)

**Goal:** assessor adjusts the suggested roof when auto-generation isn't right.

- New "Roof" mode on `SvgCanvas`: plan-view overlay showing roof face boundaries and ridge lines over the footprint.
- Editing operations (deliberately constrained):
  - drag ridge endpoints / whole ridge lines in plan (snap to grid, footprint vertices, edge midpoints, perpendicular offsets)
  - edit ridge height numerically, or set a target pitch for a chosen face and derive height
  - split a ridge (for T/L roofs), delete a ridge segment
- Constraint that keeps this tractable: **every roof face connects one footprint-edge run to ridge geometry** (i.e., the editor manipulates a ridge graph and derives faces, rather than free-form 3D mesh editing). Faces regenerate from the ridge graph on every edit; invalid states render red with the core validation message.
- Pitch/area readout per face in the sidebar while editing (assessors think in pitch).
- Out of scope: curved roofs, mansards as a primitive (achievable manually via two ridge levels), free vertex editing in 3D.
- **Tests:** ridge-graph → faces derivation unit tests (rect, offset ridge, L with valley); studio e2e checklist: take suggested dual roof on an L-plan (flat fallback), draw ridges manually, confirm schedule.

## Phase 5 — Edge adjacency control

**Goal:** mark walls as party / unheated / external without modelling the neighbour.

- 2D canvas: click an edge in "Adjacency" mode → cycle external → party → unheated; colour-code edges.
- Store per-edge adjacency on `MassDesign`; map into the spec (check how core's spec expresses adjacency vs. `detectAbutments()` — manual tags must *override* but not conflict with detected abutments; detected party edges shown locked).
- Critical for terraces: an assessor models one dwelling and tags both shared walls as party — no neighbour masses needed.
- **Tests:** manually-tagged party wall produces same schedule rows/junctions as the two-box-party fixture's detected one.

## Phase 6 — Persistence, undo/redo, export

- **Save/load:** project file = `{ version: 1, designState }` as downloadable JSON + file-open (no backend, matches the deterministic-pipeline philosophy). Include `version` from day one for future migration.
- **Undo/redo:** history stack in the Phase 1 reducer — snapshot on committed actions (vertex drag end, form submit, mass add/delete), cap ~50 entries. Keyboard: Ctrl+Z / Ctrl+Shift+Z.
- **Export:** "Export CSV" button calling core's `csv.ts` formatters (already tested); plus "Copy spec JSON" for the existing CLI/batch path. Defer direct SAP-software formats until a target package (e.g. Elmhurst/Stroma input format) is confirmed — CSV covers the immediate workflow.

## Phase 7 — Real-dwelling validation pass

Model each common UK type end-to-end in the studio; each becomes a fixture + hand-checked `validation.test.ts` entry:

1. Mid-terrace, 2 storeys, dual pitch, party walls both sides (Phase 5)
2. Semi with single-storey rear extension, mono-pitch (Phases 1+3)
3. Bungalow, hip roof, two dormers (Phase 0)
4. L-plan with continuous dual roof + valley (Phases 3+4)
5. Bay window — model as a small projecting mass with angled footprint edges (arbitrary footprints already supported; verify occlusion of the host wall behind the bay)
6. Conservatory — mass tagged unheated adjacency on the shared wall (confirm SAP treatment: typically excluded from envelope with the separating wall/door treated as external-to-unheated)

Fix whatever this shakes out. This phase is the acceptance test for "model any real dwelling in minutes."

---

## Sequencing & sizing

| Phase | Depends on | Relative size |
|---|---|---|
| 0 Dormer frame fix | — | S |
| 1 Multi-mass UI | — | M |
| 2 Openings UI | 1 (state restructure) | M |
| 3 Roof representation | 0 | L |
| 4 Roof editor | 3 | L |
| 5 Adjacency | 1 | S |
| 6 Persist/undo/export | 1 | M |
| 7 Validation pass | all | M |

Phases 0 and 1 can run in parallel. After Phase 2 the tool is already usable for the majority of rectangular-ish dwellings; Phases 3–4 unlock the long tail.

## Working rules (per the efficiency note)

- One phase per session/PR; commit studio to git **before** Phase 1 starts (it's currently uncommitted — that's the first action).
- Read the target file before every edit; targeted edits only; never regenerate whole files.
- Run `core` tests after any core change; add tests in the same change, not after.
- No speculative features; anything not in a phase gets a one-line note in a `LATER.md`, not code.
- Core API changes are additive only; existing fixtures must pass unmodified throughout.
