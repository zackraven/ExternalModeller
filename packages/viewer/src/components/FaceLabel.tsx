import { useMemo } from "react";
import { Html } from "@react-three/drei";
import type { Face, FaceOpening, Vec3 } from "@sap-geometry/core";
import { faceCentroid } from "../lib/faceGeometry";

interface FaceLabelProps {
  face: Face;
}

export function FaceLabel({ face }: FaceLabelProps) {
  const center = useMemo(() => faceCentroid(face), [face]);

  // Offset slightly along the face normal so labels don't z-fight
  const pos: [number, number, number] = [
    center[0] + face.normal[0] * 0.05,
    center[1] + face.normal[1] * 0.05,
    center[2] + face.normal[2] * 0.05,
  ];

  return (
    <Html position={pos} center>
      <div className="face-label">
        {face.id} — {face.area.toFixed(1)} m²
      </div>
    </Html>
  );
}

interface OpeningLabelProps {
  opening: FaceOpening;
  normal: Vec3;
}

export function OpeningLabel({ opening, normal }: OpeningLabelProps) {
  const center = useMemo(() => {
    const n = opening.vertices.length;
    let x = 0, y = 0, z = 0;
    for (const v of opening.vertices) {
      x += v[0]; y += v[1]; z += v[2];
    }
    return [x / n, y / n, z / n] as [number, number, number];
  }, [opening]);

  const pos: [number, number, number] = [
    center[0] + normal[0] * 0.06,
    center[1] + normal[1] * 0.06,
    center[2] + normal[2] * 0.06,
  ];

  return (
    <Html position={pos} center>
      <div className="face-label opening-label">
        {opening.type} — {opening.area.toFixed(2)} m²
      </div>
    </Html>
  );
}
