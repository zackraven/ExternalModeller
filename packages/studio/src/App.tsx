import { useState, useCallback, useMemo, useEffect } from "react";
import type { Vec2, BuildingSpec } from "@sap-geometry/core";
import { SvgCanvas } from "./components/SvgCanvas";
import { PreviewPanel } from "./components/PreviewPanel";
import { EditorToolbar } from "./components/EditorToolbar";
import { ScheduleSidebar } from "./components/ScheduleSidebar";
import { useModel } from "./hooks/useModel";
import { buildSpec } from "./lib/specFromVertices";
import { verticesFromSpec } from "./lib/verticesFromSpec";
import { defaultDesign } from "./lib/types";
import type { DesignState } from "./lib/types";

export function App() {
  const [vertices, setVertices] = useState<Vec2[]>([]);
  const [closed, setClosed] = useState(false);
  const [selectedFaceId, setSelectedFaceId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [design, setDesign] = useState<DesignState>(defaultDesign);

  const spec = useMemo<BuildingSpec | null>(() => {
    if (closed && vertices.length >= 3) {
      return buildSpec(vertices, design);
    }
    return null;
  }, [closed, vertices, design]);

  const { model, schedule, error } = useModel(spec);

  // Clear selection when spec changes (face IDs change on rebuild)
  useEffect(() => {
    setSelectedFaceId(null);
  }, [spec]);

  const handleClose = useCallback(() => {
    setClosed(true);
  }, []);

  const handleClear = useCallback(() => {
    setVertices([]);
    setClosed(false);
    setDesign(defaultDesign());
    setSelectedFaceId(null);
    setShowOverlay(false);
  }, []);

  const handleUndo = useCallback(() => {
    setVertices((v) => v.slice(0, -1));
  }, []);

  const handleLoadFixture = useCallback((fixtureSpec: BuildingSpec) => {
    const verts = verticesFromSpec(fixtureSpec);
    setVertices(verts);
    setClosed(true);

    // Extract design from fixture's first mass
    const mass = fixtureSpec.masses[0];
    if (mass) {
      const roof = mass.roof;
      const roofType = roof?.type ?? "flat";
      const mappedType: DesignState["roof"]["type"] =
        roofType === "none" ? "flat" : roofType;
      setDesign({
        storeys: mass.storeys,
        roof: {
          type: mappedType,
          pitch: (roof && "pitch" in roof && roof.pitch) || 35,
          ridgeEdge: (roof && "ridgeEdge" in roof && roof.ridgeEdge) || 0,
        },
        openings: mass.openings,
        components: mass.components,
      });
    }
  }, []);

  const handleVertexMove = useCallback((index: number, pos: Vec2) => {
    setVertices((prev) => prev.map((v, i) => (i === index ? pos : v)));
  }, []);

  const handleToggleOverlay = useCallback(() => {
    setShowOverlay((v) => !v);
  }, []);

  return (
    <div className="studio-app">
      <div className="editor-pane">
        <EditorToolbar
          closed={closed}
          onClear={handleClear}
          onUndo={handleUndo}
          canUndo={vertices.length > 0}
          onLoadFixture={handleLoadFixture}
          showOverlay={showOverlay}
          onToggleOverlay={handleToggleOverlay}
        />
        <SvgCanvas
          vertices={vertices}
          onSetVertices={setVertices}
          closed={closed}
          onClose={handleClose}
          onVertexMove={handleVertexMove}
        />
      </div>
      <div className="preview-pane">
        <PreviewPanel
          model={model}
          error={error}
          selectedFaceId={selectedFaceId}
          onSelectFace={setSelectedFaceId}
          showOverlay={showOverlay}
        />
      </div>
      <ScheduleSidebar
        schedule={schedule}
        vertices={vertices}
        closed={closed}
        model={model}
        selectedFaceId={selectedFaceId}
        design={design}
        onDesignChange={setDesign}
      />
    </div>
  );
}
