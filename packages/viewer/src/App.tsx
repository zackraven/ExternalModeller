import { useState, useCallback } from "react";
import type { BuildingSpec, FaceModel, Schedule } from "@sap-geometry/core";
import { resolve, solve } from "@sap-geometry/core";
import { DropZone } from "./components/DropZone";
import { Viewer } from "./components/Viewer";

export function App() {
  const [spec, setSpec] = useState<BuildingSpec | null>(null);
  const [model, setModel] = useState<FaceModel | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showNorth, setShowNorth] = useState(false);

  const loadSpec = useCallback((s: BuildingSpec) => {
    setSpec(s);
    const m = resolve(s);
    setModel(m);
    setSchedule(solve(s));
    setSelectedFaceId(null);
  }, []);

  const handleReset = useCallback(() => {
    setSpec(null);
    setModel(null);
    setSchedule(null);
    setSelectedFaceId(null);
  }, []);

  if (!spec || !model || !schedule) {
    return <DropZone onLoad={loadSpec} />;
  }

  return (
    <div className="app">
      <Viewer
        spec={spec}
        model={model}
        schedule={schedule}
        selectedFaceId={selectedFaceId}
        onSelectFace={setSelectedFaceId}
        showOverlay={showOverlay}
        showNorth={showNorth}
        onToggleOverlay={() => setShowOverlay((v) => !v)}
        onToggleNorth={() => setShowNorth((v) => !v)}
        onReset={handleReset}
      />
    </div>
  );
}
