import type { BuildingSpec } from "@sap-geometry/core";
import { FIXTURES } from "../lib/fixtures";

interface EditorToolbarProps {
  closed: boolean;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onLoadFixture: (spec: BuildingSpec) => void;
  showOverlay: boolean;
  onToggleOverlay: () => void;
}

export function EditorToolbar({
  closed,
  onClear,
  onUndo,
  canUndo,
  onLoadFixture,
  showOverlay,
  onToggleOverlay,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar">
      <button onClick={onClear}>Clear</button>
      <button onClick={onUndo} disabled={closed || !canUndo}>
        Undo
      </button>
      <select
        value=""
        onChange={(e) => {
          const idx = parseInt(e.target.value, 10);
          if (!isNaN(idx) && FIXTURES[idx]) {
            onLoadFixture(FIXTURES[idx].spec);
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
        disabled={!closed}
        onClick={onToggleOverlay}
      >
        Labels
      </button>
    </div>
  );
}
