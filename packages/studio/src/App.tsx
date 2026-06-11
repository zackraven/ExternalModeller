import { useReducer, useMemo, useEffect, useCallback } from "react";
import type { BuildingSpec } from "@sap-geometry/core";
import { SvgCanvas } from "./components/SvgCanvas";
import { PreviewPanel } from "./components/PreviewPanel";
import { EditorToolbar } from "./components/EditorToolbar";
import { ScheduleSidebar } from "./components/ScheduleSidebar";
import { useModel } from "./hooks/useModel";
import { buildSpecFromMasses } from "./lib/specFromVertices";
import { defaultStudioState } from "./lib/types";
import { studioReducer } from "./lib/reducer";
import type { StudioAction } from "./lib/reducer";

export function App() {
  const [state, dispatch] = useReducer(studioReducer, undefined, defaultStudioState);

  const activeMass = state.masses.find((m) => m.id === state.activeMassId) ?? null;
  const hasDrawingMass = state.masses.some((m) => !m.closed);
  const hasClosedMass = state.masses.some((m) => m.closed);

  const spec = useMemo<BuildingSpec | null>(() => {
    const closedMasses = state.masses.filter(
      (m) => m.closed && m.vertices.length >= 3,
    );
    if (closedMasses.length === 0) return null;
    return buildSpecFromMasses(state.masses);
  }, [state.masses]);

  const { model, schedule, error } = useModel(spec);

  // Clear selection when spec changes (face IDs change on rebuild)
  useEffect(() => {
    dispatch({ type: "SET_SELECTED_FACE", id: null });
  }, [spec]);

  const handleSelectFace = useCallback((id: string | null) => {
    dispatch({ type: "SET_SELECTED_FACE", id });
  }, []);

  return (
    <div className="studio-app">
      <div className="editor-pane">
        <EditorToolbar
          hasDrawingMass={hasDrawingMass}
          hasClosedMass={hasClosedMass}
          canUndo={hasDrawingMass && !!activeMass && activeMass.vertices.length > 0}
          showOverlay={state.showOverlay}
          dispatch={dispatch}
        />
        <SvgCanvas
          masses={state.masses}
          activeMassId={state.activeMassId}
          dispatch={dispatch}
        />
      </div>
      <div className="preview-pane">
        <PreviewPanel
          model={model}
          error={error}
          selectedFaceId={state.selectedFaceId}
          onSelectFace={handleSelectFace}
          showOverlay={state.showOverlay}
        />
      </div>
      <ScheduleSidebar
        schedule={schedule}
        model={model}
        masses={state.masses}
        activeMassId={state.activeMassId}
        selectedFaceId={state.selectedFaceId}
        dispatch={dispatch}
      />
    </div>
  );
}
