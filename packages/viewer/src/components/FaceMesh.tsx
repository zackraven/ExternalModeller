import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Face } from "@sap-geometry/core";
import { buildFaceGeometry, buildOpeningGeometry } from "../lib/faceGeometry";
import { faceColor, openingColor, SELECTED_EMISSIVE } from "../lib/colors";

interface FaceMeshProps {
  face: Face;
  selected: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Track pointer position to distinguish click from drag. */
const pointerState = { x: 0, y: 0 };

export function FaceMesh({ face, selected, selectedId, onSelect }: FaceMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => buildFaceGeometry(face), [face]);
  const color = useMemo(() => faceColor(face.tag), [face.tag]);

  const openingGeometries = useMemo(
    () =>
      face.openings.map((o) => ({
        id: o.id,
        type: o.type,
        geometry: buildOpeningGeometry(o, face.normal),
      })),
    [face],
  );

  return (
    <group>
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
      {openingGeometries.map((o) => {
        const isSelected = selectedId === o.id;
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
                onSelect(o.id);
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
    </group>
  );
}
