# Conventions

Authoritative reference. Do not re-derive or re-litigate these.

## Units

- **Length**: metres (m)
- **Area**: square metres (m²)
- **Angles**: degrees (°)
- No imperial anywhere.

## Coordinate frame

- Right-handed: `+X` = East, `+Y` = North, `+Z` = up.
- Ground floor at `z = 0`.

## North

- Model north is `+Y`.
- `spec.meta.northAngle` (default `0`) rotates true north clockwise from `+Y`.

## Footprint winding

- Vertices **counter-clockwise viewed from above** (positive shoelace area).
- Reject or auto-correct clockwise input.

## Outward wall normal

- For a CCW footprint, edge direction `d` gives outward normal `rotateCW90(d) = (d.y, -d.x)`.
- Interior is on the left of each directed edge; outward is to the right.

## Azimuth

- `azimuth = atan2(n.x, n.y)` in degrees, normalised to `[0, 360)`, then add `northAngle`.
- A face whose outward normal is `−Y` reads **180° (South)**.
- East = 90, North = 0, West = 270.

## Tilt

- Angle of the face from horizontal.
- Vertical wall = **90**.
- Flat roof / floor = **0**.
- Pitched roof plane = its pitch angle.
- Floor normal points down; roof / flat-roof normal points up.

## Areas

- Use **Newell's method** (`area` and `normal` from one pass over the 3D polygon).
- Never assume a face lies in a coordinate plane.

## Tolerance

- Snap all coordinates to `1e-4 m` before any boolean / topology op.
- Treat lengths / areas below `1e-6` as zero.
