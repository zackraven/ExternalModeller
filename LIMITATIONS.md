# Surface Modeller — Known Limitations

## Footprint geometry

- **Non-rectangular pitched roofs unsupported.** Parametric roof types (mono, dual, hip) are hardcoded for 4-vertex rectangular footprints. L-shapes, pentagons, and other non-quad polygons can only use `flat` or `cuts` roof types.
- **Self-intersecting footprints not validated.** The engine does not check for self-intersection. Self-intersecting polygons produce undefined geometry.
- **Concave footprints** are geometrically allowed but may produce unexpected roof faces or occlusion artefacts.
- **Curved edges not supported.** All footprint edges are straight line segments.

## Roof types

- **Vertical cuts (90° pitch) not supported.** Cut-plane pitch is constrained to 1°–89.9°. Dutch gables and other vertical roof features are out of scope.
- **Curved roofs not supported.** All roof geometry is piecewise-planar.
- **Butterfly roofs** (valley-to-centre) require splitting into separate masses. A single mass cannot express an inward-draining roof.
- **Custom roof planarity tolerance is 1 cm.** Face vertices must lie within 0.01 m of the computed plane or the face is rejected.
- **Custom roof altitude constraint.** All roof face vertices must be at or above `wallTopZ`.
- **Headroom prism default is 12 m** above `wallTopZ` for cut-plane roofs. Override via `roof.headroom` if needed.

## Storeys

- **No maximum storey count enforced** by the engine (studio UI caps at 4).
- **Storey height must be > 0.** Zero or negative heights are rejected by schema validation.

## Openings

- **Wall openings only.** Openings are placed by storey index and footprint edge index; roof and floor openings are not supported (rooflights are placed as components instead).
- **Fit-on-wall not strictly validated.** If `sill + height` exceeds storey height, or `count * width` exceeds edge length, geometry may be silently clipped or produce zero-area openings.
- **Three types: window, door, rooflight.** Other opening types are rejected.

## Components (dormers & rooflights)

- **Dormers require a valid `roofPlane` index.** If the referenced roof face does not exist, the dormer is silently skipped.
- **Dormer shapes: gable, hip, flat.** No shed or barrel dormers.
- **Placement uses face-normal coordinate frame.** Works on non-rectangular roof faces but may produce unexpected geometry on highly irregular shapes.

## Multi-mass & adjacency

- **Party wall detection is edge-exact.** Only footprint edges that are geometrically identical (within 0.1 mm snap tolerance) between two masses are detected as party walls. Staggered, offset, or T-junction abutments require manual `adjacency` overrides in the spec.
- **Cross-mass occlusion** clips faces on the same geometric plane only. Faces at different angles are not occluded.
- **No topological linking** across masses. Each mass is independently resolved; there are no continuous surfaces or automatic thermal bridging.

## Junctions

- **Pre-defined junction types only.** The 14 junction types (external_corner, internal_corner, wall_ground_floor, etc.) are extracted by pattern-matching half-edge topology. Custom junction types cannot be added.
- **Valley/ridge classification** uses `cross(n1, n2) . edgeDir` sign. Complex multi-plane intersections may be misclassified.

## Numeric precision

- **Snap tolerance: 0.1 mm** (`SNAP = 1e-4`). Coordinates closer than this are treated as identical.
- **No safeguards for extreme scales.** Very large buildings (>10 km) or very small features (<0.01 mm) may suffer floating-point precision loss.
- **Degenerate face threshold: 1e-8 m².** Faces with area below this are treated as zero-area.

## Studio UI

- **No undo/redo** for design changes (only vertex undo during footprint drawing).
- **No project persistence.** Specs can be exported/imported as JSON but there is no project save/load or history.
- **Opening and dormer placement** is only configurable via JSON spec; there is no graphical placement UI.
