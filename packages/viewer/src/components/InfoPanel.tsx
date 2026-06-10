import type { FaceModel, Schedule, SurfaceRow, Face } from "@sap-geometry/core";
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

export function InfoPanel({
  model,
  schedule,
  selectedFaceId,
  northAngle,
}: InfoPanelProps) {
  if (selectedFaceId) {
    const face = model.faces.find((f) => f.id === selectedFaceId);
    if (!face) return null;

    // Find matching schedule row
    const row = schedule.surfaces.find((s) => s.name === face.id);

    const azimuth = azimuthOf(face.normal, northAngle);
    const tilt = tiltOf(face.normal);

    return (
      <div className="info-panel">
        <h3>Face Detail</h3>
        <FaceDetail face={face} row={row} azimuth={azimuth} tilt={tilt} />
      </div>
    );
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
  row,
  azimuth,
  tilt,
}: {
  face: Face;
  row: SurfaceRow | undefined;
  azimuth: number;
  tilt: number;
}) {
  return (
    <table>
      <tbody>
        <tr><td>Name</td><td>{face.id}</td></tr>
        <tr><td>Type</td><td>{face.tag.type}</td></tr>
        <tr><td>Adjacency</td><td>{face.tag.adjacency}</td></tr>
        <tr><td>Gross area</td><td>{face.area.toFixed(2)} m²</td></tr>
        {row && <tr><td>Net area</td><td>{row.area.toFixed(2)} m²</td></tr>}
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
