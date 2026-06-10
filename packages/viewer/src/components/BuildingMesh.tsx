import { useMemo } from "react";
import * as THREE from "three";
import type { FaceModel } from "@sap-geometry/core";
import { FaceMesh } from "./FaceMesh";
import { FaceLabel, OpeningLabel } from "./FaceLabel";
import { boundingBoxCenter } from "../lib/faceGeometry";

interface BuildingMeshProps {
  model: FaceModel;
  selectedFaceId: string | null;
  onSelectFace: (id: string) => void;
  showOverlay: boolean;
}

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

  return (
    <group position={[-center[0], -center[1], 0]}>
      {model.faces.map((face) => (
        <FaceMesh
          key={face.id}
          face={face}
          selected={face.id === selectedFaceId}
          selectedId={selectedFaceId}
          onSelect={onSelectFace}
        />
      ))}
      {showOverlay &&
        model.faces.map((face) => (
          <FaceLabel key={`label-${face.id}`} face={face} />
        ))}
      {showOverlay &&
        model.faces.flatMap((face) =>
          face.openings.map((opening) => (
            <OpeningLabel
              key={`label-${opening.id}`}
              opening={opening}
              normal={face.normal}
            />
          )),
        )}
      {/* Edge wireframes */}
      {model.faces.map((face) => {
        const positions = new Float32Array(
          face.vertices.flatMap((v) => [v[0], v[1], v[2]]),
        );
        return (
          <lineLoop key={`edge-${face.id}`}>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[positions, 3]}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#000000" linewidth={1} />
          </lineLoop>
        );
      })}
      {/* Opening wireframes */}
      {model.faces.flatMap((face) =>
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
