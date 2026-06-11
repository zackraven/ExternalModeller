import type { Dispatch } from "react";
import { FIXTURES } from "../lib/fixtures";
import type { StudioAction } from "../lib/reducer";

interface EditorToolbarProps {
  hasDrawingMass: boolean;
  hasClosedMass: boolean;
  canUndo: boolean;
  showOverlay: boolean;
  dispatch: Dispatch<StudioAction>;
}

export function EditorToolbar({
  hasDrawingMass,
  hasClosedMass,
  canUndo,
  showOverlay,
  dispatch,
}: EditorToolbarProps) {
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
