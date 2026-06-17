import { useMemo } from "react";
import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import type { Face, FaceModel, Vec3 } from "@sap-geometry/core";
import { FaceMesh } from "./FaceMesh";
import { FaceLabel, OpeningLabel } from "./FaceLabel";
import { buildOpeningGeometry, boundingBoxCenter } from "../lib/faceGeometry";
import { triangulate } from "../lib/triangulate";
import { faceColor, openingColor, SELECTED_EMISSIVE } from "../lib/colors";
import { planeKey, makeProjection } from "../lib/mergedArea";

interface BuildingMeshProps {
  model: FaceModel;
  selectedFaceId: string | null;
  onSelectFace: (id: string) => void;
  showOverlay: boolean;
}

// ── Snap / key helpers ────────────────────────────────────

const SNAP = 1e-4;

function snapVal(x: number): string {
  return (Math.round(x / SNAP) * SNAP).toFixed(4);
}

function vtxKey(v: Vec3): string {
  return `${snapVal(v[0])},${snapVal(v[1])},${snapVal(v[2])}`;
}

function edgeKey(a: Vec3, b: Vec3): string {
  const ka = vtxKey(a);
  const kb = vtxKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

// ── Point-in-polygon (ray casting) ────────────────────────

function pointInPolygon2D(
  point: [number, number],
  polygon: [number, number][],
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Face clipping helpers ─────────────────────────────────

/** Polygon area via Newell's method (works for any 3D planar polygon). */
function newellArea(verts: Vec3[]): number {
  let ax = 0, ay = 0, az = 0;
  for (let i = 0; i < verts.length; i++) {
    const c = verts[i];
    const n = verts[(i + 1) % verts.length];
    ax += (c[1] - n[1]) * (c[2] + n[2]);
    ay += (c[2] - n[2]) * (c[0] + n[0]);
    az += (c[0] - n[0]) * (c[1] + n[1]);
  }
  return 0.5 * Math.sqrt(ax * ax + ay * ay + az * az);
}

/**
 * Clip a wall face to show only the portion above clipZ.
 * Raises any vertex below clipZ up to clipZ.
 * Returns null if the result would be degenerate.
 */
function clipWallAbove(face: Face, clipZ: number): Face | null {
  const newVerts: Vec3[] = face.vertices.map(v =>
    v[2] < clipZ ? [v[0], v[1], clipZ] : v,
  );
  const zMin = Math.min(...newVerts.map(v => v[2]));
  const zMax = Math.max(...newVerts.map(v => v[2]));
  if (zMax - zMin < 0.01) return null;

  const area = newellArea(newVerts);
  if (area < 0.001) return null;

  const openings = face.openings.filter(o =>
    o.vertices.every(v => v[2] >= clipZ - 0.01),
  );
  return { ...face, vertices: newVerts, area, openings };
}

/** 2D shoelace area for a single ring. */
function ring2DArea(ring: [number, number][]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    a += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

/**
 * Clip a near-flat face (roof / exposed ceiling) to exclude regions covered
 * by a taller mass's footprint.  Returns one or more clipped faces, or an
 * empty array if the face is fully covered.
 */
function clipFlatFaceAgainstMasses(
  face: Face,
  massInfo: Map<string, { footprint: [number, number][]; maxZ: number }>,
): Face[] {
  const zs = face.vertices.map(v => v[2]);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  if (zMax - zMin > 0.1) return [face]; // not flat — skip

  const faceZ = (zMin + zMax) / 2;

  // Collect footprints of masses that extend above this face
  const clips: polygonClipping.Polygon[] = [];
  for (const [massId, mi] of massInfo) {
    if (massId === face.tag.mass) continue;
    if (mi.footprint.length < 3) continue;
    if (mi.maxZ <= faceZ + 0.02) continue;
    clips.push([mi.footprint]);
  }
  if (clips.length === 0) return [face];

  const facePoly: polygonClipping.Polygon = [
    face.vertices.map(v => [v[0], v[1]] as [number, number]),
  ];

  let diff: polygonClipping.MultiPolygon;
  try {
    diff = polygonClipping.difference(facePoly, ...clips);
  } catch {
    return [face];
  }

  if (diff.length === 0) return []; // fully covered

  const result: Face[] = [];
  for (let pi = 0; pi < diff.length; pi++) {
    const outerRing = diff[pi][0] as [number, number][];
    const verts3D: Vec3[] = outerRing.map(p => [p[0], p[1], faceZ] as Vec3);

    // Area = outer ring minus any hole rings
    let area = ring2DArea(outerRing);
    for (let ri = 1; ri < diff[pi].length; ri++) {
      area -= ring2DArea(diff[pi][ri] as [number, number][]);
    }
    if (area < 0.001) continue;

    result.push({
      ...face,
      id: diff.length > 1 ? `${face.id}_p${pi}` : face.id,
      vertices: verts3D,
      area,
      openings: pi === 0 ? face.openings : [],
    });
  }

  return result.length > 0 ? result : [face];
}

// ── Union geometry builder ────────────────────────────────

interface UnionResult {
  geometry: THREE.BufferGeometry;
  /** Outer-ring 3D vertices for each union polygon (for wireframe). */
  outlines: Vec3[][];
}

function buildUnion(faces: Face[]): UnionResult {
  const normal = faces[0].normal;
  const { to2D, to3D } = makeProjection(normal, faces[0].vertices[0]);

  // Convert each face to a polygon-clipping Polygon
  const polys: polygonClipping.Polygon[] = faces.map((face) => [
    face.vertices.map((v) => to2D(v)),
  ]);

  let unionResult: polygonClipping.MultiPolygon;
  try {
    unionResult = polygonClipping.union(polys[0], ...polys.slice(1));
  } catch {
    return buildStackedFallback(faces);
  }

  if (unionResult.length === 0) {
    return buildStackedFallback(faces);
  }

  // Collect all opening holes projected to 2D
  const openingHoles: { ring2D: [number, number][]; verts3D: Vec3[] }[] = [];
  for (const face of faces) {
    for (const o of face.openings) {
      openingHoles.push({
        ring2D: o.vertices.map((v) => to2D(v)),
        verts3D: o.vertices,
      });
    }
  }

  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  const outlines: Vec3[][] = [];
  let vertexOffset = 0;

  for (const polygon of unionResult) {
    const outerRing = polygon[0] as [number, number][];
    const outerVerts3D: Vec3[] = outerRing.map((p) => to3D(p));
    outlines.push(outerVerts3D);

    // Collect holes: from polygon-clipping + opening holes inside this polygon
    const holes3D: Vec3[][] = [];
    for (let i = 1; i < polygon.length; i++) {
      holes3D.push((polygon[i] as [number, number][]).map((p) => to3D(p)));
    }
    for (const oh of openingHoles) {
      if (
        oh.ring2D.length > 0 &&
        pointInPolygon2D(oh.ring2D[0], outerRing)
      ) {
        holes3D.push(oh.verts3D);
      }
    }

    const indices = triangulate(
      outerVerts3D,
      normal,
      holes3D.length > 0 ? holes3D : undefined,
    );

    const verts: Vec3[] = [...outerVerts3D];
    for (const h of holes3D) verts.push(...h);

    for (const v of verts) {
      allPositions.push(v[0], v[1], v[2]);
      allNormals.push(normal[0], normal[1], normal[2]);
    }

    for (let i = 0; i < indices.length; i += 3) {
      allIndices.push(
        indices[i] + vertexOffset,
        indices[i + 1] + vertexOffset,
        indices[i + 2] + vertexOffset,
      );
    }

    vertexOffset += verts.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(allPositions), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(allNormals), 3),
  );
  geometry.setIndex(allIndices);
  return { geometry, outlines };
}

/** Fallback: stack all faces into one geometry without union. */
function buildStackedFallback(faces: Face[]): UnionResult {
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  const outlines: Vec3[][] = [];
  let vertexOffset = 0;

  for (const face of faces) {
    outlines.push([...face.vertices]);
    const holes =
      face.openings.length > 0
        ? face.openings.map((o) => o.vertices)
        : undefined;
    const indices = triangulate(face.vertices, face.normal, holes);
    const allVerts: Vec3[] = [...face.vertices];
    if (holes) {
      for (const h of holes) allVerts.push(...h);
    }
    for (const v of allVerts) {
      allPositions.push(v[0], v[1], v[2]);
      allNormals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    for (let i = 0; i < indices.length; i += 3) {
      allIndices.push(
        indices[i] + vertexOffset,
        indices[i + 1] + vertexOffset,
        indices[i + 2] + vertexOffset,
      );
    }
    vertexOffset += allVerts.length;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(allPositions), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(allNormals), 3),
  );
  geometry.setIndex(allIndices);
  return { geometry, outlines };
}

// ── MergedFaceMesh component ──────────────────────────────

const pointerState = { x: 0, y: 0 };

/**
 * Renders coplanar faces from multiple masses as a single
 * union geometry with its own wireframe outline.
 */
function MergedFaceMesh({
  faces,
  selectedFaceId,
  onSelectFace,
}: {
  faces: Face[];
  selectedFaceId: string | null;
  onSelectFace: (id: string) => void;
}) {
  const { geometry, outlines } = useMemo(
    () => buildUnion(faces),
    [faces],
  );

  const color = useMemo(() => faceColor(faces[0].tag), [faces]);

  const { to2D, originalPolys } = useMemo(() => {
    const proj = makeProjection(faces[0].normal, faces[0].vertices[0]);
    return {
      to2D: proj.to2D,
      originalPolys: faces.map((f) => ({
        id: f.id,
        poly: f.vertices.map((v) => proj.to2D(v)),
      })),
    };
  }, [faces]);

  const openings = useMemo(() => {
    const result: {
      id: string;
      type: string;
      geometry: THREE.BufferGeometry;
    }[] = [];
    for (const face of faces) {
      for (const o of face.openings) {
        result.push({
          id: o.id,
          type: o.type,
          geometry: buildOpeningGeometry(o, face.normal),
        });
      }
    }
    return result;
  }, [faces]);

  // Wireframe from union outlines
  const wireframePositions = useMemo(() => {
    const segments: number[] = [];
    for (const ring of outlines) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        segments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    return new Float32Array(segments);
  }, [outlines]);

  const selected = faces.some(
    (f) =>
      f.id === selectedFaceId ||
      f.openings.some((o) => o.id === selectedFaceId),
  );

  return (
    <group>
      <mesh
        geometry={geometry}
        onPointerDown={(e) => {
          pointerState.x = e.clientX;
          pointerState.y = e.clientY;
        }}
        onPointerUp={(e) => {
          const dx = e.clientX - pointerState.x;
          const dy = e.clientY - pointerState.y;
          if (dx * dx + dy * dy < 9) {
            e.stopPropagation();
            const local = e.object.worldToLocal(e.point.clone());
            const p2D = to2D([local.x, local.y, local.z]);
            for (const { id, poly } of originalPolys) {
              if (pointInPolygon2D(p2D, poly)) {
                onSelectFace(id);
                return;
              }
            }
            onSelectFace(faces[0].id);
          }
        }}
      >
        <meshStandardMaterial
          color={color}
          emissive={selected ? SELECTED_EMISSIVE : 0x000000}
          emissiveIntensity={selected ? 0.4 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {openings.map((o) => {
        const isSelected = selectedFaceId === o.id;
        return (
          <mesh
            key={o.id}
            geometry={o.geometry}
            onPointerDown={(e) => {
              pointerState.x = e.clientX;
              pointerState.y = e.clientY;
            }}
            onPointerUp={(e) => {
              const dx = e.clientX - pointerState.x;
              const dy = e.clientY - pointerState.y;
              if (dx * dx + dy * dy < 9) {
                e.stopPropagation();
                onSelectFace(o.id);
              }
            }}
          >
            <meshStandardMaterial
              color={openingColor(o.type)}
              transparent
              opacity={isSelected ? 0.7 : 0.4}
              emissive={isSelected ? SELECTED_EMISSIVE : 0x000000}
              emissiveIntensity={isSelected ? 0.4 : 0}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      {/* Union outline wireframe */}
      {wireframePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[wireframePositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#000000" linewidth={1} />
        </lineSegments>
      )}
    </group>
  );
}

// ── Main component ────────────────────────────────────────

export function BuildingMesh({
  model,
  selectedFaceId,
  onSelectFace,
  showOverlay,
}: BuildingMeshProps) {
  const center = useMemo(
    () => boundingBoxCenter(model.faces),
    [model.faces],
  );

  // Extract mass footprints and max heights from faces (for containment checks)
  const massInfo = useMemo(() => {
    const info = new Map<string, { footprint: [number, number][]; maxZ: number }>();
    for (const face of model.faces) {
      const mid = face.tag.mass;
      let entry = info.get(mid);
      if (!entry) {
        entry = { footprint: [], maxZ: 0 };
        info.set(mid, entry);
      }
      if (face.tag.type === "floor") {
        entry.footprint = face.vertices.map((v) => [v[0], v[1]] as [number, number]);
      }
      for (const v of face.vertices) {
        if (v[2] > entry.maxZ) entry.maxZ = v[2];
      }
    }
    return info;
  }, [model.faces]);

  // Hide party walls, fully-occluded faces, clip walls/roofs inside other masses
  const visibleFaces = useMemo(() => {
    const result: Face[] = [];

    for (const face of model.faces) {
      if (face.tag.adjacency === "party") continue;
      if (face.occludedArea && face.occludedArea >= face.area * 0.99) continue;

      // ── Wall handling: hide or clip walls embedded in another mass ──
      if (face.tag.type === "wall") {
        const EPS = 0.02;
        // Find bottom edge: the two lowest vertices (works for quads and gables)
        const byZ = [...face.vertices]
          .map((v) => v)
          .sort((va, vb) => va[2] - vb[2]);
        const a = byZ[0];
        const b = byZ[1];
        const wallBaseZ = Math.min(a[2], b[2]);
        const wallTopZ = Math.max(...face.vertices.map((v) => v[2]));
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.sqrt(dx * dx + dy * dy);
        let processed: Face | null = face;

        if (len > EPS * 4) {
          const ux = dx / len;
          const uy = dy / len;
          const tA: [number, number] = [
            a[0] + ux * EPS + face.normal[0] * EPS,
            a[1] + uy * EPS + face.normal[1] * EPS,
          ];
          const tB: [number, number] = [
            b[0] - ux * EPS + face.normal[0] * EPS,
            b[1] - uy * EPS + face.normal[1] * EPS,
          ];
          for (const [massId, mi] of massInfo) {
            if (massId === face.tag.mass) continue;
            if (mi.footprint.length === 0) continue;
            if (wallBaseZ >= mi.maxZ - EPS) continue;
            if (
              pointInPolygon2D(tA, mi.footprint) &&
              pointInPolygon2D(tB, mi.footprint)
            ) {
              if (wallTopZ <= mi.maxZ + EPS) {
                processed = null; // fully inside → hide
              } else {
                processed = clipWallAbove(face, mi.maxZ); // clip to exposed portion
              }
              break;
            }
          }
        }

        if (processed) result.push(processed);
        continue;
      }

      // ── Flat roof / exposed ceiling: clip out regions under taller masses ──
      if (face.tag.type === "roof") {
        result.push(...clipFlatFaceAgainstMasses(face, massInfo));
        continue;
      }

      result.push(face);
    }

    return result;
  }, [model.faces, massInfo]);

  // Split into solo faces (single mass) and merged groups (cross-mass coplanar)
  const { soloFaces, mergedGroups, mergedFaceIds } = useMemo(() => {
    const groups = new Map<string, Face[]>();
    for (const face of visibleFaces) {
      const pk = planeKey(face);
      let g = groups.get(pk);
      if (!g) {
        g = [];
        groups.set(pk, g);
      }
      g.push(face);
    }

    const solo: Face[] = [];
    const merged: { key: string; faces: Face[] }[] = [];
    const mergedIds = new Set<string>();

    for (const [pk, group] of groups) {
      const masses = new Set(group.map((f) => f.tag.mass));
      if (masses.size > 1) {
        merged.push({ key: pk, faces: group });
        for (const f of group) mergedIds.add(f.id);
      } else {
        solo.push(...group);
      }
    }

    return { soloFaces: solo, mergedGroups: merged, mergedFaceIds: mergedIds };
  }, [visibleFaces]);

  // Collect edges from merged group faces — solo wireframe should skip edges
  // that lie on a merged-group plane (they'd create visible internal lines)
  const mergedEdgeSet = useMemo(() => {
    const set = new Set<string>();
    for (const group of mergedGroups) {
      for (const face of group.faces) {
        const verts = face.vertices;
        for (let i = 0; i < verts.length; i++) {
          set.add(edgeKey(verts[i], verts[(i + 1) % verts.length]));
        }
      }
    }
    return set;
  }, [mergedGroups]);

  // Wireframe for solo faces only, skipping edges shared with merged groups
  const wireframePositions = useMemo(() => {
    const segments: number[] = [];
    for (const face of soloFaces) {
      const verts = face.vertices;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        // Skip edges that coincide with merged-group face edges
        if (mergedEdgeSet.has(edgeKey(a, b))) continue;
        segments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }
    }
    return new Float32Array(segments);
  }, [soloFaces, mergedEdgeSet]);

  return (
    <group position={[-center[0], -center[1], 0]}>
      {/* Solo faces — normal per-face rendering */}
      {soloFaces.map((face) => (
        <FaceMesh
          key={face.id}
          face={face}
          selected={face.id === selectedFaceId}
          selectedId={selectedFaceId}
          onSelect={onSelectFace}
        />
      ))}

      {/* Merged groups — union geometry + outline wireframe */}
      {mergedGroups.map((group) => (
        <MergedFaceMesh
          key={`merged-${group.key}`}
          faces={group.faces}
          selectedFaceId={selectedFaceId}
          onSelectFace={onSelectFace}
        />
      ))}

      {/* Overlay labels */}
      {showOverlay &&
        visibleFaces.map((face) => (
          <FaceLabel key={`label-${face.id}`} face={face} />
        ))}
      {showOverlay &&
        visibleFaces.flatMap((face) =>
          face.openings.map((opening) => (
            <OpeningLabel
              key={`label-${opening.id}`}
              opening={opening}
              normal={face.normal}
            />
          )),
        )}

      {/* Solo face wireframes */}
      {wireframePositions.length > 0 && (
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[wireframePositions, 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#000000" linewidth={1} />
        </lineSegments>
      )}

      {/* Opening wireframes */}
      {visibleFaces.flatMap((face) =>
        face.openings.map((opening) => {
          const positions = new Float32Array(
            opening.vertices.flatMap((v) => [v[0], v[1], v[2]]),
          );
          return (
            <lineLoop key={`opening-edge-${opening.id}`}>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[positions, 3]}
                />
              </bufferGeometry>
              <lineBasicMaterial color="#333333" linewidth={1} />
            </lineLoop>
          );
        }),
      )}
    </group>
  );
}
