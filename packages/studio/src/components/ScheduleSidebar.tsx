import type { Dispatch } from "react";
import type { Schedule, FaceModel, Face, FaceOpening, SurfaceRow } from "@sap-geometry/core";
import { azimuthOf, tiltOf } from "@sap-geometry/core";
import { computeMergedGroupInfo, computeCrossMassOcclusion } from "@sap-geometry/viewer/lib/mergedArea";
import { PropertyControls } from "./PropertyControls";
import { OpeningForm } from "./OpeningForm";
import { OpeningsTable } from "./OpeningsTable";
import { parseWallFaceId } from "../lib/faceIdUtils";
import type { MassDesign, DesignState } from "../lib/types";
import type { StudioAction } from "../lib/reducer";

interface ScheduleSidebarProps {
  schedule: Schedule | null;
  model: FaceModel | null;
  masses: MassDesign[];
  activeMassId: string | null;
  selectedFaceId: string | null;
  dispatch: Dispatch<StudioAction>;
}

const COMPASS: [number, string][] = [
  [0, "N"], [45, "NE"], [90, "E"], [135, "SE"],
  [180, "S"], [225, "SW"], [270, "W"], [315, "NW"],
];

function compassDir(azimuth: number): string {
  let best = "N";
  let bestDelta = 360;
  for (const [deg, label] of COMPASS) {
    const delta = Math.abs(((azimuth - deg + 540) % 360) - 180);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = label;
    }
  }
  return best;
}

function findOpening(
  model: FaceModel,
  id: string,
): { opening: FaceOpening; hostFace: Face } | null {
  for (const face of model.faces) {
    for (const opening of face.openings) {
      if (opening.id === id) return { opening, hostFace: face };
    }
  }
  return null;
}

function FaceDetailTable({ face, model }: { face: Face; model: FaceModel }) {
  const azimuth = azimuthOf(face.normal, 0);
  const tilt = tiltOf(face.normal);
  const merged = computeMergedGroupInfo(model.faces, face.id);

  if (merged) {
    const netArea = merged.unionArea - merged.openingArea;
    return (
      <>
        <h3>Face Detail</h3>
        <table>
          <tbody>
            <tr><td>Name</td><td>{face.id} (+ {merged.faceCount - 1} more)</td></tr>
            <tr><td>Type</td><td>{face.tag.type}</td></tr>
            <tr><td>Adjacency</td><td>{face.tag.adjacency}</td></tr>
            <tr><td>Combined area</td><td>{merged.unionArea.toFixed(2)} m²</td></tr>
            {merged.openingArea > 0 && (
              <tr><td>Openings</td><td>{merged.openingArea.toFixed(2)} m²</td></tr>
            )}
            {merged.openingArea > 0 && (
              <tr><td>Net area</td><td>{netArea.toFixed(2)} m²</td></tr>
            )}
            <tr><td>Azimuth</td><td>{azimuth.toFixed(0)}° ({compassDir(azimuth)})</td></tr>
            <tr><td>Tilt</td><td>{tilt.toFixed(0)}°</td></tr>
          </tbody>
        </table>
      </>
    );
  }

  const openingArea = face.openings.reduce((s, o) => s + o.area, 0);
  const occluded = face.occludedArea ?? 0;
  const crossOcclusion = computeCrossMassOcclusion(model.faces, face.id);
  const totalOccluded = occluded + crossOcclusion;
  const netArea = face.area - openingArea - totalOccluded;
  const hasOpenings = face.openings.length > 0;
  const hasDeductions = hasOpenings || totalOccluded > 0;

  return (
    <>
      <h3>Face Detail</h3>
      <table>
        <tbody>
          <tr><td>Name</td><td>{face.id}</td></tr>
          <tr><td>Type</td><td>{face.tag.type}</td></tr>
          <tr><td>Adjacency</td><td>{face.tag.adjacency}</td></tr>
          <tr><td>{hasDeductions ? "Gross area" : "Area"}</td><td>{face.area.toFixed(2)} m²</td></tr>
          {totalOccluded > 0 && (
            <tr><td>Occluded</td><td>{totalOccluded.toFixed(2)} m²</td></tr>
          )}
          {hasOpenings && (
            <tr><td>Openings</td><td>{face.openings.length} ({openingArea.toFixed(2)} m²</td></tr>
          )}
          {hasDeductions && <tr><td>Net area</td><td>{netArea.toFixed(2)} m²</td></tr>}
          <tr><td>Azimuth</td><td>{azimuth.toFixed(0)}° ({compassDir(azimuth)})</td></tr>
          <tr><td>Tilt</td><td>{tilt.toFixed(0)}°</td></tr>
        </tbody>
      </table>
    </>
  );
}

function OpeningDetailTable({
  opening,
  hostFace,
  schedule,
}: {
  opening: FaceOpening;
  hostFace: Face;
  schedule: Schedule | null;
}) {
  const azimuth = azimuthOf(hostFace.normal, 0);
  const tilt = tiltOf(hostFace.normal);
  const scheduleRow = schedule?.openings.find((o) => o.name === opening.id);

  return (
    <>
      <h3>Opening Detail</h3>
      <table>
        <tbody>
          <tr><td>Name</td><td>{opening.id}</td></tr>
          <tr><td>Type</td><td>{opening.type}</td></tr>
          <tr><td>Host face</td><td>{hostFace.id}</td></tr>
          <tr><td>Area</td><td>{opening.area.toFixed(2)} m²</td></tr>
          <tr><td>Azimuth</td><td>{azimuth.toFixed(0)}° ({compassDir(azimuth)})</td></tr>
          <tr><td>Tilt</td><td>{tilt.toFixed(0)}°</td></tr>
          {scheduleRow && (
            <tr><td>Schedule area</td><td>{scheduleRow.area.toFixed(2)} m²</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}

export function ScheduleSidebar({
  schedule,
  model,
  masses,
  activeMassId,
  selectedFaceId,
  dispatch,
}: ScheduleSidebarProps) {
  const activeMass = masses.find((m) => m.id === activeMassId) ?? null;
  const closedMasses = masses.filter((m) => m.closed);
  const hasAnyClosedMass = closedMasses.length > 0;
  const isDrawing = activeMass !== null && !activeMass.closed;

  // Detect abutting masses (share a footprint edge with active mass)
  const abutMasses = activeMass?.closed ? (() => {
    const SNAP = 1e-4;
    const edgeKey = (a: [number, number], b: [number, number]) => {
      const ka = `${(Math.round(a[0] / SNAP) * SNAP).toFixed(4)},${(Math.round(a[1] / SNAP) * SNAP).toFixed(4)}`;
      const kb = `${(Math.round(b[0] / SNAP) * SNAP).toFixed(4)},${(Math.round(b[1] / SNAP) * SNAP).toFixed(4)}`;
      return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    };
    const activeEdges = new Set<string>();
    const v = activeMass.vertices;
    for (let i = 0; i < v.length; i++) {
      activeEdges.add(edgeKey(v[i], v[(i + 1) % v.length]));
    }
    return closedMasses
      .filter((m) => {
        if (m.id === activeMass.id) return false;
        const mv = m.vertices;
        for (let i = 0; i < mv.length; i++) {
          if (activeEdges.has(edgeKey(mv[i], mv[(i + 1) % mv.length]))) return true;
        }
        return false;
      })
      .map((m) => ({ id: m.id, name: m.name }));
  })() : [];

  // Mode 1: Face or opening selected
  if (selectedFaceId && model) {
    const face = model.faces.find((f) => f.id === selectedFaceId);
    if (face) {
      const wallRef = parseWallFaceId(selectedFaceId);
      const wallMass = wallRef
        ? masses.find((m) => m.id === wallRef.massId)
        : null;

      // Find existing opening on this (storey, edge) — enforce one per wall
      let existingIndex: number | undefined;
      if (wallRef && wallMass?.openings) {
        const idx = wallMass.openings.findIndex(
          (o) => o.storey === wallRef.storey && o.edge === wallRef.edge,
        );
        if (idx >= 0) existingIndex = idx;
      }

      return (
        <div className="schedule-sidebar">
          <FaceDetailTable face={face} model={model} />
          {wallRef && wallMass && (
            <OpeningForm
              key={`${wallRef.massId}_${wallRef.storey}_${wallRef.edge}_${existingIndex ?? "new"}`}
              massId={wallRef.massId}
              storey={wallRef.storey}
              edge={wallRef.edge}
              mass={wallMass}
              existingIndex={existingIndex}
              dispatch={dispatch}
            />
          )}
        </div>
      );
    }

    const result = findOpening(model, selectedFaceId);
    if (result) {
      return (
        <div className="schedule-sidebar">
          <OpeningDetailTable
            opening={result.opening}
            hostFace={result.hostFace}
            schedule={schedule}
          />
        </div>
      );
    }
  }

  // Bridge activeMass to DesignState for PropertyControls
  const design: DesignState | null = activeMass?.closed
    ? {
        storeys: activeMass.storeys,
        roof: activeMass.roof,
        openings: activeMass.openings,
        components: activeMass.components,
        headroom: activeMass.headroom,
      }
    : null;

  const handleDesignChange = (d: DesignState) => {
    if (!activeMassId) return;
    dispatch({
      type: "UPDATE_MASS",
      id: activeMassId,
      patch: {
        storeys: d.storeys,
        roof: d.roof,
        openings: d.openings,
        components: d.components,
        headroom: d.headroom,
      },
    });
  };

  return (
    <div className="schedule-sidebar">
      {/* Mass list */}
      {masses.length > 0 && (
        <>
          <h3>Masses</h3>
          <div className="mass-list">
            {masses.filter((m) => m.closed).map((mass) => (
              <div
                key={mass.id}
                className={`mass-item ${mass.id === activeMassId ? "active" : ""}`}
                onClick={() => dispatch({ type: "SET_ACTIVE_MASS", id: mass.id })}
              >
                <input
                  className="mass-name-input"
                  value={mass.name}
                  onChange={(e) =>
                    dispatch({ type: "RENAME_MASS", id: mass.id, name: e.target.value })
                  }
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  className="mass-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "REMOVE_MASS", id: mass.id });
                  }}
                  title="Delete mass"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="mass-add-btn"
              onClick={() => dispatch({ type: "ADD_MASS" })}
              disabled={isDrawing}
            >
              + Add Mass
            </button>
          </div>
        </>
      )}

      {/* Drawing instructions */}
      {(isDrawing || !hasAnyClosedMass) && (
        <>
          <h3>Drawing</h3>
          <div className="drawing-info">
            {activeMass && (
              <p>Vertices: {activeMass.vertices.length}</p>
            )}
            <p style={{ marginTop: 8 }}>
              {!activeMass || activeMass.vertices.length === 0
                ? masses.length === 0
                  ? "Click to place first vertex"
                  : "Click to start drawing new mass"
                : activeMass.vertices.length < 3
                  ? "Click to add more vertices"
                  : "Click first vertex to close polygon"}
            </p>
          </div>
        </>
      )}

      {/* Property controls for active closed mass */}
      {design && activeMass && (
        <PropertyControls
          design={design}
          onDesignChange={handleDesignChange}
          edgeCount={activeMass.vertices.length}
          vertices={activeMass.vertices}
          massId={activeMass.id}
          roofCuts={activeMass.roofCuts}
          abutMasses={abutMasses}
          dispatch={dispatch}
        />
      )}

      {/* UNCUT_TOP warning banner for cuts mode */}
      {activeMass?.roofCuts?.length && schedule && (() => {
        const hasUncutTop = schedule.surfaces.some(
          (s: SurfaceRow) => s.mass === activeMass.id && s.type === "roof" && s.tilt === 0,
        );
        if (!hasUncutTop) return null;
        return (
          <div style={{
            background: "#8b0000", color: "#fff", padding: "8px 10px",
            borderRadius: 4, margin: "8px 0", fontSize: "0.85em",
          }}>
            <strong>UNCUT TOP</strong>: The roof still has a surviving flat
            top face. Add more cuts to fully define the roof shape.
          </div>
        );
      })()}

      {/* Openings table for active mass */}
      {activeMass?.closed && activeMass.openings?.length && (
        <OpeningsTable mass={activeMass} dispatch={dispatch} />
      )}

      {/* Per-face readouts in cuts or custom roof mode */}
      {activeMass?.roofCuts?.length && schedule && (() => {
        const roofRows = schedule.surfaces.filter(
          (r: SurfaceRow) => r.mass === activeMass.id && r.type === "roof",
        );
        if (roofRows.length === 0) return null;
        return (
          <>
            <h3 style={{ marginTop: 12 }}>Roof Faces</h3>
            <table>
              <tbody>
                {roofRows.map((r: SurfaceRow) => (
                  <tr key={r.name}>
                    <td>{r.name.replace(`${activeMass.id}_`, "")}</td>
                    <td>
                      {r.tilt.toFixed(0)}° {r.area.toFixed(1)}m² {compassDir(r.azimuth)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );
      })()}

      {/* Schedule totals */}
      {schedule && (
        <>
          <h3 style={{ marginTop: 16 }}>Schedule</h3>
          <table>
            <tbody>
              <tr>
                <td>Ext. wall (net)</td>
                <td>{schedule.totals.externalWallNet.toFixed(1)} m²</td>
              </tr>
              <tr>
                <td>Floor</td>
                <td>{schedule.totals.floor.toFixed(1)} m²</td>
              </tr>
              <tr>
                <td>Roof</td>
                <td>{schedule.totals.roof.toFixed(1)} m²</td>
              </tr>
              <tr>
                <td>Windows</td>
                <td>{schedule.totals.window.toFixed(1)} m²</td>
              </tr>
              <tr>
                <td>Doors</td>
                <td>{schedule.totals.door.toFixed(1)} m²</td>
              </tr>
              <tr>
                <td>Party wall</td>
                <td>{schedule.totals.party.toFixed(1)} m²</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 16 }}>Surfaces</h3>
          <table>
            <tbody>
              <tr>
                <td>Total surfaces</td>
                <td>{schedule.surfaces.length}</td>
              </tr>
              <tr>
                <td>Total openings</td>
                <td>{schedule.openings.length}</td>
              </tr>
              <tr>
                <td>Total junctions</td>
                <td>{schedule.junctions.length}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
