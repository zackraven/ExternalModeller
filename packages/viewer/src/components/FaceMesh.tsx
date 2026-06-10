import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Face } from "@sap-geometry/core";
import { buildFaceGeometry } from "../lib/faceGeometry";
import { faceColor, SELECTED_EMISSIVE } from "../lib/colors";

interface FaceMeshProps {
  face: Face;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** Track pointer position to distinguish click from drag. */
const pointerState = { x: 0, y: 0 };

export function FaceMesh({ face, selected, onSelect }: FaceMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => buildFaceGeometry(face), [face]);
  const color = useMemo(() => faceColor(face.tag), [face.tag]);

  return (
    <mesh
      ref={meshRef}
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
          onSelect(face.id);
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
  );
}
