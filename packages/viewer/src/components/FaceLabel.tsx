import { useMemo } from "react";
import { Html } from "@react-three/drei";
import type { Face } from "@sap-geometry/core";
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
