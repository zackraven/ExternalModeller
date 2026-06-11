import { useRef, type Dispatch } from "react";
import type { BuildingSpec } from "@sap-geometry/core";
import { FIXTURES } from "../lib/fixtures";
import type { StudioAction } from "../lib/reducer";

interface EditorToolbarProps {
  hasDrawingMass: boolean;
  hasClosedMass: boolean;
  canUndo: boolean;
  showOverlay: boolean;
  spec: BuildingSpec | null;
  dispatch: Dispatch<StudioAction>;
}

function tryParseSpec(text: string): BuildingSpec | null {
  try {
    const obj = JSON.parse(text);
    if (obj && Array.isArray(obj.masses) && obj.masses.length > 0) return obj;
  } catch { /* ignore */ }
  return null;
}

export function EditorToolbar({
  hasDrawingMass,
  hasClosedMass,
  canUndo,
  showOverlay,
  spec,
  dispatch,
}: EditorToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = tryParseSpec(reader.result as string);
      if (parsed) {
        dispatch({ type: "LOAD_FIXTURE", spec: parsed });
      } else {
        alert("Invalid BuildingSpec JSON: file must contain a \"masses\" array.");
      }
    };
    reader.readAsText(file);
    // Reset so the same file can be re-imported
    e.target.value = "";
  };

  const handleExport = () => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "model.spec.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="editor-toolbar">
      <button onClick={() => dispatch({ type: "CLEAR_ALL" })}>Clear</button>
      <button
        onClick={() => dispatch({ type: "UNDO_VERTEX" })}
        disabled={!canUndo}
      >
        Undo
      </button>
      <select
        value=""
        onChange={(e) => {
          const idx = parseInt(e.target.value, 10);
          if (!isNaN(idx) && FIXTURES[idx]) {
            dispatch({ type: "LOAD_FIXTURE", spec: FIXTURES[idx].spec });
          }
        }}
      >
        <option value="" disabled>
          Load fixture...
        </option>
        {FIXTURES.map((f, i) => (
          <option key={i} value={i}>
            {f.label}
          </option>
        ))}
      </select>
      <input ref={fileRef} type="file" accept=".json" hidden onChange={handleFileImport} />
      <button onClick={() => fileRef.current?.click()}>Import</button>
      <button onClick={handleExport} disabled={!spec}>Export</button>
      <button
        className={showOverlay ? "active" : ""}
        disabled={!hasClosedMass}
        onClick={() => dispatch({ type: "TOGGLE_OVERLAY" })}
      >
        Labels
      </button>
    </div>
  );
}
