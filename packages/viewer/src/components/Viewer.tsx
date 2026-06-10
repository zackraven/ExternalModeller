import { useRef, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, GizmoHelper, GizmoViewport } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BuildingSpec, FaceModel, Schedule } from "@sap-geometry/core";
import { BuildingMesh } from "./BuildingMesh";
import { NorthIndicator } from "./NorthIndicator";
import { InfoPanel } from "./InfoPanel";
import { Toolbar } from "./Toolbar";

interface ViewerProps {
  spec: BuildingSpec;
  model: FaceModel;
  schedule: Schedule;
  selectedFaceId: string | null;
  onSelectFace: (id: string | null) => void;
  showOverlay: boolean;
  showNorth: boolean;
  onToggleOverlay: () => void;
  onToggleNorth: () => void;
  onReset: () => void;
}

export function Viewer({
  spec,
  model,
  schedule,
  selectedFaceId,
  onSelectFace,
  showOverlay,
  showNorth,
  onToggleOverlay,
  onToggleNorth,
  onReset,
}: ViewerProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  const handleResetView = useCallback(() => {
    controlsRef.current?.reset();
  }, []);

  const northAngle = spec.meta?.northAngle ?? 0;

  return (
    <>
      <div className="viewer-panel">
        <Canvas
          camera={{ position: [15, -15, 12], fov: 50, up: [0, 0, 1] }}
          onPointerMissed={() => onSelectFace(null)}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, -10, 15]} intensity={1} />
          <directionalLight position={[-5, 5, 10]} intensity={0.3} />

          <BuildingMesh
            model={model}
            selectedFaceId={selectedFaceId}
            onSelectFace={onSelectFace}
            showOverlay={showOverlay}
          />

          {showNorth && <NorthIndicator northAngle={northAngle} />}

          <gridHelper
            args={[40, 40, "#334455", "#222233"]}
            rotation={[Math.PI / 2, 0, 0]}
          />

          <OrbitControls ref={controlsRef} makeDefault />
          <GizmoHelper alignment="bottom-left" margin={[60, 60]}>
            <GizmoViewport labelColor="white" axisHeadScale={1} />
          </GizmoHelper>
        </Canvas>
      </div>
      <div className="side-panel">
        <Toolbar
          showOverlay={showOverlay}
          showNorth={showNorth}
          onToggleOverlay={onToggleOverlay}
          onToggleNorth={onToggleNorth}
          onResetView={handleResetView}
          onLoadNew={onReset}
        />
        <InfoPanel
          model={model}
          schedule={schedule}
          selectedFaceId={selectedFaceId}
          northAngle={northAngle}
        />
      </div>
    </>
  );
}
