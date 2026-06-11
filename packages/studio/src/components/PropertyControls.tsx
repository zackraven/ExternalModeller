import type { DesignState, RoofConfig } from "../lib/types";

interface PropertyControlsProps {
  design: DesignState;
  onDesignChange: (d: DesignState) => void;
  edgeCount: number;
}

export function PropertyControls({ design, onDesignChange, edgeCount }: PropertyControlsProps) {
  const storeyCount = design.storeys.length;

  const setStoreyCount = (count: number) => {
    const clamped = Math.max(1, Math.min(4, count));
    const storeys = [...design.storeys];
    while (storeys.length < clamped) {
      storeys.push({ height: 2.4 });
    }
    onDesignChange({ ...design, storeys: storeys.slice(0, clamped) });
  };

  const setStoreyHeight = (index: number, height: number) => {
    const clamped = Math.max(2.0, Math.min(6.0, height));
    const storeys = design.storeys.map((s, i) =>
      i === index ? { height: clamped } : s,
    );
    onDesignChange({ ...design, storeys });
  };

  const setRoof = (partial: Partial<RoofConfig>) => {
    onDesignChange({ ...design, roof: { ...design.roof, ...partial } });
  };

  const showPitch = design.roof.type !== "flat";
  const showRidgeEdge = design.roof.type === "mono" || design.roof.type === "dual";

  return (
    <div className="property-controls">
      <h3>Storeys</h3>
      <div className="prop-row">
        <label>Count</label>
        <div className="prop-spinner">
          <button onClick={() => setStoreyCount(storeyCount - 1)} disabled={storeyCount <= 1}>-</button>
          <span>{storeyCount}</span>
          <button onClick={() => setStoreyCount(storeyCount + 1)} disabled={storeyCount >= 4}>+</button>
        </div>
      </div>
      {design.storeys.map((s, i) => (
        <div className="prop-row" key={i}>
          <label>S{i + 1} height</label>
          <input
            type="number"
            min={2.0}
            max={6.0}
            step={0.1}
            value={s.height}
            onChange={(e) => setStoreyHeight(i, parseFloat(e.target.value) || 2.4)}
          />
        </div>
      ))}

      <h3 style={{ marginTop: 12 }}>Roof</h3>
      <div className="prop-row">
        <label>Type</label>
        <select
          value={design.roof.type}
          onChange={(e) => setRoof({ type: e.target.value as RoofConfig["type"] })}
        >
          <option value="flat">flat</option>
          <option value="mono">mono</option>
          <option value="dual">dual</option>
          <option value="hip">hip</option>
        </select>
      </div>
      {showPitch && (
        <div className="prop-row">
          <label>Pitch {design.roof.pitch}°</label>
          <input
            type="range"
            min={15}
            max={75}
            step={1}
            value={design.roof.pitch}
            onChange={(e) => setRoof({ pitch: parseInt(e.target.value, 10) })}
          />
        </div>
      )}
      {showRidgeEdge && (
        <div className="prop-row">
          <label>Ridge edge</label>
          <select
            value={design.roof.ridgeEdge}
            onChange={(e) => setRoof({ ridgeEdge: parseInt(e.target.value, 10) })}
          >
            {Array.from({ length: edgeCount }, (_, i) => (
              <option key={i} value={i}>Edge {i}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
