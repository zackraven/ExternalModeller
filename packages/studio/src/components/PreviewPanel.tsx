import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import type { FaceModel } from "@sap-geometry/core";
import { BuildingMesh } from "@sap-geometry/viewer/components/BuildingMesh";

interface PreviewPanelProps {
  model: FaceModel | null;
  error: string | null;
  selectedFaceId: string | null;
  onSelectFace: (id: string | null) => void;
  showOverlay: boolean;
}

export function PreviewPanel({
  model,
  error,
  selectedFaceId,
  onSelectFace,
  showOverlay,
}: PreviewPanelProps) {
  if (error) {
    return <div className="preview-error">{error}</div>;
  }

  if (!model) {
    return <div className="preview-placeholder">Draw a footprint to see preview</div>;
  }

  return (
    <Canvas
      camera={{ position: [15, -15, 12], fov: 50, up: [0, 0, 1] }}
      onPointerMissed={() => onSelectFace(null)}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, -10, 15]} intensity={0.8} />
      <directionalLight position={[-5, 5, 10]} intensity={0.3} />
      <BuildingMesh
        model={model}
        selectedFaceId={selectedFaceId}
        onSelectFace={(id: string) => onSelectFace(id)}
        showOverlay={showOverlay}
      />
      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
        <GizmoViewport />
      </GizmoHelper>
      <gridHelper args={[50, 50, "#333355", "#222244"]} rotation={[Math.PI / 2, 0, 0]} />
    </Canvas>
  );
}
