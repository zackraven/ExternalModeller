# BuildingSpec — Input Schema Reference

This document defines the JSON format consumed by the surface-modeller `solve()` function. It is the contract between any spec-generating AI and the geometry engine.

A companion JSON-Schema file lives at `packages/core/building-spec.schema.json`.

---

## Coordinate system

| Axis | Direction |
|------|-----------|
| +X   | East      |
| +Y   | North     |
| +Z   | Up        |

Ground floor sits at z = 0. All lengths are in **metres**, angles in **degrees**.

---

## Top-level structure

```jsonc
{
  "meta": {                        // optional
    "units": "m",                  // only "m" supported
    "northAngle": 0                // clockwise rotation of true north from +Y (0–360)
  },
  "masses": [ ... ]                // one or more Mass objects (required, ≥ 1)
}
```

---

## Mass

Each mass is an independent building volume with its own footprint, walls, floor, and roof.

```jsonc
{
  "id": "nave",                    // optional; auto-assigned "mass_0" etc.
  "footprint": [[0,0],[20,0],[20,10],[0,10]],  // Vec2[], ≥ 3 vertices, CCW
  "storeys": [{"height": 2.4}],   // ≥ 1 storey, bottom to top
  "roof": { "type": "flat" },     // optional; defaults to no roof
  "openings": [ ... ],            // optional; windows/doors on walls
  "components": [ ... ],          // optional; dormers/rooflights on roof
  "adjacency": [ ... ],           // optional; edge adjacency overrides
  "floorAdjacency": "ground"      // "ground" | "exposed" | "unheated"
}
```

### Footprint rules

- Vertices are `[x, y]` pairs forming a closed polygon (do not repeat the first vertex).
- Winding must be **counter-clockwise** viewed from above (positive shoelace area). The engine auto-corrects clockwise input.
- Minimum 3 vertices. Rectangular footprints use 4.
- Edges are numbered 0 to N-1, where edge `i` goes from vertex `i` to vertex `(i+1) % N`.

### Multi-mass buildings

When `masses` has more than one entry, the engine automatically:
- **Detects party walls**: walls on exactly-shared footprint edges between masses are tagged `"party"`.
- **Computes occlusion**: external faces hidden behind another mass's surface have their area reduced.

Give each mass a meaningful `id` (e.g. `"nave"`, `"tower"`) for readable output.

---

## Storey

```jsonc
{ "height": 2.4 }    // floor-to-ceiling in metres; must be > 0
```

Storeys are listed bottom to top. Walls are extruded per-storey, so a 3-storey tower produces 3 tiers of wall faces per footprint edge.

---

## Roof

```jsonc
{ "type": "dual", "pitch": 35, "ridgeEdge": 0 }
```

| Field       | Type    | Required | Description |
|-------------|---------|----------|-------------|
| `type`      | string  | yes      | `"flat"`, `"mono"`, `"dual"`, `"hip"`, or `"none"` |
| `pitch`     | number  | for mono/dual/hip | Pitch angle in degrees (0–90) |
| `ridgeEdge` | integer | no       | Edge the ridge runs parallel to. Defaults to the longest edge. |

**Roof types explained:**

- **flat** — Horizontal plane at the top of the last storey.
- **mono** — Single pitched plane. Eaves at `ridgeEdge`, rises to opposite edge.
- **dual** — Two pitched planes meeting at a central ridge. Produces two gable wall triangles at the side edges.
- **hip** — Four pitched planes. All eaves at wall-top level; ridge is shorter than the building length.
- **none** — No roof generated.

---

## Opening

Openings (windows, doors) are placed on wall faces.

```jsonc
{
  "storey": 0,           // 0-indexed storey
  "edge": 0,             // 0-indexed footprint edge
  "type": "window",      // "window" | "door" | "rooflight"
  "width": 1.2,          // metres
  "height": 1.5,         // metres
  "sill": 0.9,           // metres above storey floor (default 0)
  "count": 3             // number of identical openings (default 1)
}
```

- `sill` defaults to 0, which is typical for doors.
- `count > 1` places that many identical openings evenly spaced along the edge.
- The opening must fit within the wall face: `sill + height ≤ storey height` and `count × width ≤ edge length`.

---

## Component

Roof-mounted features: dormers and rooflights.

```jsonc
{
  "kind": "dormer",
  "roofPlane": 0,                  // which roof plane (0-indexed)
  "shape": "gable",               // "gable" | "hip" | "flat" (dormers only)
  "width": 2.0,
  "height": 1.5,
  "projection": 1.5,              // horizontal depth (optional)
  "window": { "width": 1.2, "height": 1.0 }  // dormer window (optional)
}
```

---

## EdgeAdjacency

Override the default `"external"` adjacency for specific wall faces.

```jsonc
{ "storey": 0, "edge": 1, "type": "party" }
```

| Type       | Meaning |
|------------|---------|
| `external` | Faces outdoors (default) |
| `party`    | Shared wall with neighbour — no heat loss |
| `internal` | Connects to an uninsulated interior space |
| `unheated` | Adjacent to an unheated zone |

The engine also auto-detects party walls when two masses share a footprint edge, so manual `adjacency` overrides are only needed for edges the engine can't detect (e.g. staggered masses).

---

## Examples

### Minimal box

```json
{
  "masses": [{
    "footprint": [[0,0],[10,0],[10,6],[0,6]],
    "storeys": [{"height": 2.4}],
    "roof": {"type": "flat"}
  }]
}
```

Output: 4 walls (24 + 14.4 + 24 + 14.4 = 76.8 m²), 1 floor (60 m²), 1 flat roof (60 m²).

### Box with windows and a door

```json
{
  "masses": [{
    "footprint": [[0,0],[10,0],[10,6],[0,6]],
    "storeys": [{"height": 2.4}],
    "roof": {"type": "flat"},
    "openings": [
      {"storey": 0, "edge": 0, "type": "window", "width": 1.2, "height": 1.2, "sill": 0.9, "count": 3},
      {"storey": 0, "edge": 2, "type": "door", "width": 0.9, "height": 2.1}
    ]
  }]
}
```

### Dual-pitch roof with dormer

```json
{
  "masses": [{
    "footprint": [[0,0],[10,0],[10,6],[0,6]],
    "storeys": [{"height": 2.4}],
    "roof": {"type": "dual", "pitch": 35, "ridgeEdge": 0},
    "components": [
      {"kind": "dormer", "roofPlane": 0, "shape": "gable", "width": 2, "height": 1.5, "window": {"width": 1.2, "height": 1.0}}
    ]
  }]
}
```

Output: 4 walls + 2 gable triangles, 2 pitched roof planes, 1 floor, dormer (front + 2 cheeks + roof).

### L-shaped footprint

```json
{
  "masses": [{
    "footprint": [[0,0],[10,0],[10,4],[6,4],[6,8],[0,8]],
    "storeys": [{"height": 2.4}],
    "roof": {"type": "flat"}
  }]
}
```

6 walls, 1 floor (56 m²), 1 flat roof. Has 5 external corners and 1 internal corner.

### Semi-detached pair (two masses, party wall)

```json
{
  "masses": [
    {
      "footprint": [[0,0],[10,0],[10,6],[0,6]],
      "storeys": [{"height": 2.4}],
      "roof": {"type": "flat"}
    },
    {
      "footprint": [[10,0],[20,0],[20,6],[10,6]],
      "storeys": [{"height": 2.4}],
      "roof": {"type": "flat"}
    }
  ]
}
```

The shared edge at x = 10 is automatically detected as a party wall.
Output: 6 external walls + 2 party walls per mass, total external wall = 124.8 m², party = 28.8 m².

### Church (nave + tower, cross-mass occlusion)

```json
{
  "masses": [
    {
      "id": "nave",
      "footprint": [[0,0],[20,0],[20,10],[0,10]],
      "storeys": [{"height": 5}],
      "roof": {"type": "dual", "pitch": 40, "ridgeEdge": 0},
      "openings": [
        {"storey": 0, "edge": 0, "type": "window", "width": 1.0, "height": 2.8, "sill": 1.5, "count": 5},
        {"storey": 0, "edge": 1, "type": "window", "width": 2.0, "height": 3.5, "sill": 1.0},
        {"storey": 0, "edge": 2, "type": "window", "width": 1.0, "height": 2.8, "sill": 1.5, "count": 5}
      ]
    },
    {
      "id": "tower",
      "footprint": [[-4,3],[0,3],[0,7],[-4,7]],
      "storeys": [{"height": 5}, {"height": 4}, {"height": 4}],
      "roof": {"type": "hip", "pitch": 75},
      "openings": [
        {"storey": 0, "edge": 3, "type": "door", "width": 1.8, "height": 3.5},
        {"storey": 0, "edge": 0, "type": "window", "width": 0.6, "height": 2.0, "sill": 1.5},
        {"storey": 0, "edge": 2, "type": "window", "width": 0.6, "height": 2.0, "sill": 1.5}
      ]
    }
  ]
}
```

The tower's east wall (edge 1) at x = 0 is partially or fully hidden behind the nave's west wall and gable. The engine computes occlusion and subtracts it from the net area.

---

## Output summary

`solve(spec)` returns a `Schedule` with:

| Field      | Content |
|------------|---------|
| `surfaces` | One row per face: name, mass, storey, type, adjacency, **net** area (minus openings and occlusion), azimuth, tilt |
| `openings` | One row per opening: name, host face, type, area, azimuth, tilt |
| `junctions`| Thermal junction types and total lengths (e.g. external_corner, eaves, ridge) |
| `totals`   | Aggregated areas: externalWallNet, window, door, rooflight, roof, floor, party |
