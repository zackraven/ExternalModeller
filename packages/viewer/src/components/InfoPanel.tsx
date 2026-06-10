import type { FaceModel, Schedule, SurfaceRow, OpeningRow, Face, FaceOpening } from "@sap-geometry/core";
import { azimuthOf, tiltOf } from "@sap-geometry/core";

interface InfoPanelProps {
  model: FaceModel;
  schedule: Schedule;
  selectedFaceId: string | null;
  northAngle: number;
}

const COMPASS: [number, string][] = [
  [0, "N"], [45, "NE"], [90, "E"], [135, "SE"],
  [180, "S"], [225, "SW"], [270, "W"], [315, "NW"],
];

function compassDir(azimuth: number): string {
  // Find closest compass direction
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

/** Search all faces for an opening matching the given id. */
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

export function InfoPanel({
  model,
  schedule,
  selectedFaceId,
  northAngle,
}: InfoPanelProps) {
  if (selectedFaceId) {
    // Check if it's a face
    const face = model.faces.find((f) => f.id === selectedFaceId);
    if (face) {
      const azimuth = azimuthOf(face.normal, northAngle);
      const tilt = tiltOf(face.normal);

      return (
        <div className="info-panel">
          <h3>Face Detail</h3>
          <FaceDetail face={face} azimuth={azimuth} tilt={tilt} />
        </div>
      );
    }

    // Check if it's an opening
    const result = findOpening(model, selectedFaceId);
    if (result) {
      const { opening, hostFace } = result;
      const azimuth = azimuthOf(hostFace.normal, northAngle);
      const tilt = tiltOf(hostFace.normal);
      const scheduleRow = schedule.openings.find((o) => o.name === opening.id);

      return (
        <div className="info-panel">
          <h3>Opening Detail</h3>
          <OpeningDetail
            opening={opening}
            hostFace={hostFace}
            scheduleRow={scheduleRow}
            azimuth={azimuth}
            tilt={tilt}
          />
        </div>
      );
    }

    return null;
  }

  return (
    <div className="info-panel">
      <h3>Schedule Totals</h3>
      <TotalsSummary schedule={schedule} />
      <h3 style={{ marginTop: 12 }}>Surfaces ({schedule.surfaces.length})</h3>
      <SurfacesList surfaces={schedule.surfaces} />
    </div>
  );
}

function FaceDetail({
  face,
  azimuth,
  tilt,
}: {
  face: Face;
  azimuth: number;
  tilt: number;
}) {
  const openingArea = face.openings.reduce((s, o) => s + o.area, 0);
  const occluded = face.occludedArea ?? 0;
  const netArea = face.area - openingArea - occluded;
  const hasOpenings = face.openings.length > 0;
  const hasDeductions = hasOpenings || occluded > 0;

  return (
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
        <tr>
          <td>Azimuth</td>
          <td>{azimuth.toFixed(0)}° ({compassDir(azimuth)})</td>
        </tr>
        <tr><td>Tilt</td><td>{tilt.toFixed(0)}°</td></tr>
        <tr><td>Vertices</td><td>{face.vertices.length}</td></tr>
      </tbody>
    </table>
  );
}

function TotalsSummary({ schedule }: { schedule: Schedule }) {
  const t = schedule.totals;
  return (
    <table>
      <tbody>
        <tr><td>Ext. wall (net)</td><td>{t.externalWallNet.toFixed(2)} m²</td></tr>
        <tr><td>Party wall</td><td>{t.party.toFixed(2)} m²</td></tr>
        <tr><td>Floor</td><td>{t.floor.toFixed(2)} m²</td></tr>
        <tr><td>Roof</td><td>{t.roof.toFixed(2)} m²</td></tr>
        <tr><td>Windows</td><td>{t.window.toFixed(2)} m²</td></tr>
        <tr><td>Doors</td><td>{t.door.toFixed(2)} m²</td></tr>
        <tr><td>Rooflights</td><td>{t.rooflight.toFixed(2)} m²</td></tr>
      </tbody>
    </table>
  );
}

function SurfacesList({ surfaces }: { surfaces: SurfaceRow[] }) {
  return (
    <table>
      <tbody>
        {surfaces.map((s) => (
          <tr key={s.name}>
            <td>{s.name}</td>
            <td>{s.area.toFixed(1)} m²</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OpeningDetail({
  opening,
  hostFace,
  scheduleRow,
  azimuth,
  tilt,
}: {
  opening: FaceOpening;
  hostFace: Face;
  scheduleRow: OpeningRow | undefined;
  azimuth: number;
  tilt: number;
}) {
  return (
    <table>
      <tbody>
        <tr><td>Name</td><td>{opening.id}</td></tr>
        <tr><td>Type</td><td>{opening.type}</td></tr>
        <tr><td>Host face</td><td>{hostFace.id}</td></tr>
        <tr><td>Area</td><td>{opening.area.toFixed(2)} m²</td></tr>
        <tr>
          <td>Azimuth</td>
          <td>{azimuth.toFixed(0)}° ({compassDir(azimuth)})</td>
        </tr>
        <tr><td>Tilt</td><td>{tilt.toFixed(0)}°</td></tr>
        <tr><td>Vertices</td><td>{opening.vertices.length}</td></tr>
        {scheduleRow && (
          <tr><td>Schedule area</td><td>{scheduleRow.area.toFixed(2)} m²</td></tr>
        )}
      </tbody>
    </table>
  );
}
