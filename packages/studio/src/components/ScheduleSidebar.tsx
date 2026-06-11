import type { Vec2, Schedule, FaceModel, Face, FaceOpening } from "@sap-geometry/core";
import { azimuthOf, tiltOf } from "@sap-geometry/core";
import { PropertyControls } from "./PropertyControls";
import type { DesignState } from "../lib/types";

interface ScheduleSidebarProps {
  schedule: Schedule | null;
  vertices: Vec2[];
  closed: boolean;
  model: FaceModel | null;
  selectedFaceId: string | null;
  design: DesignState;
  onDesignChange: (d: DesignState) => void;
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

function FaceDetailTable({ face }: { face: Face }) {
  const azimuth = azimuthOf(face.normal, 0);
  const tilt = tiltOf(face.normal);
  const openingArea = face.openings.reduce((s, o) => s + o.area, 0);
  const occluded = face.occludedArea ?? 0;
  const netArea = face.area - openingArea - occluded;
  const hasOpenings = face.openings.length > 0;
  const hasDeductions = hasOpenings || occluded > 0;

  return (
    <>
      <h3>Face Detail</h3>
      <table>
        <tbody>
          <tr><td>Name</td><td>{face.id}</td></tr>
          <tr><td>Type</td><td>{face.tag.type}</td></tr>
          <tr><td>Adjacency</td><td>{face.tag.adjacency}</td></tr>
          <tr><td>{hasDeductions ? "Gross area" : "Area"}</td><td>{face.area.toFixed(2)} m²</td></tr>
          {occluded > 0 && (
            <tr><td>Occluded</td><td>{occluded.toFixed(2)} m²</td></tr>
          )}
          {hasOpenings && (
            <tr><td>Openings</td><td>{face.openings.length} ({openingArea.toFixed(2)} m²)</td></tr>
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
  vertices,
  closed,
  model,
  selectedFaceId,
  design,
  onDesignChange,
}: ScheduleSidebarProps) {
  // Mode 1: No polygon — drawing instructions
  if (!closed || !schedule) {
    return (
      <div className="schedule-sidebar">
        <h3>Drawing</h3>
        <div className="drawing-info">
          <p>Vertices: {vertices.length}</p>
          {!closed && (
            <p style={{ marginTop: 8 }}>
              {vertices.length === 0
                ? "Click to place first vertex"
                : vertices.length < 3
                  ? "Click to add more vertices"
                  : "Click first vertex to close polygon"}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Mode 2: Face or opening selected
  if (selectedFaceId && model) {
    const face = model.faces.find((f) => f.id === selectedFaceId);
    if (face) {
      return (
        <div className="schedule-sidebar">
          <FaceDetailTable face={face} />
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

  // Mode 3: Default — property controls + schedule totals
  const { totals } = schedule;

  return (
    <div className="schedule-sidebar">
      <PropertyControls
        design={design}
        onDesignChange={onDesignChange}
        edgeCount={vertices.length}
      />

      <h3 style={{ marginTop: 16 }}>Schedule</h3>
      <table>
        <tbody>
          <tr>
            <td>Ext. wall (net)</td>
            <td>{totals.externalWallNet.toFixed(1)} m²</td>
          </tr>
          <tr>
            <td>Floor</td>
            <td>{totals.floor.toFixed(1)} m²</td>
          </tr>
          <tr>
            <td>Roof</td>
            <td>{totals.roof.toFixed(1)} m²</td>
          </tr>
          <tr>
            <td>Windows</td>
            <td>{totals.window.toFixed(1)} m²</td>
          </tr>
          <tr>
            <td>Doors</td>
            <td>{totals.door.toFixed(1)} m²</td>
          </tr>
          <tr>
            <td>Party wall</td>
            <td>{totals.party.toFixed(1)} m²</td>
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
    </div>
  );
}
