import { useState, type Dispatch } from "react";
import type { Opening } from "@sap-geometry/core";
import type { MassDesign } from "../lib/types";
import type { StudioAction } from "../lib/reducer";
import { validateOpening } from "../lib/openingValidation";

interface OpeningFormProps {
  massId: string;
  storey: number;
  edge: number;
  mass: MassDesign;
  existingIndex?: number;
  dispatch: Dispatch<StudioAction>;
}

export function OpeningForm({
  massId,
  storey,
  edge,
  mass,
  existingIndex,
  dispatch,
}: OpeningFormProps) {
  const existing =
    existingIndex != null ? mass.openings?.[existingIndex] : undefined;

  const [type, setType] = useState<"window" | "door">(
    existing?.type === "door" ? "door" : "window",
  );
  const [width, setWidth] = useState(existing?.width ?? 1.2);
  const [height, setHeight] = useState(existing?.height ?? 1.2);
  const [sill, setSill] = useState(existing?.sill ?? (existing?.type === "door" ? 0 : 0.9));
  const [count, setCount] = useState(existing?.count ?? 1);
  const [error, setError] = useState<string | null>(null);

  // Context: wall length + storey height
  const a = mass.vertices[edge];
  const b = mass.vertices[(edge + 1) % mass.vertices.length];
  const wallLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const storeyHeight = mass.storeys[storey].height;

  const handleTypeChange = (newType: "window" | "door") => {
    setType(newType);
    if (newType === "door") {
      setSill(0);
      setHeight(2.1);
      setWidth(0.9);
    } else {
      setSill(0.9);
      setHeight(1.2);
      setWidth(1.2);
    }
  };

  const handleSubmit = () => {
    const opening: Opening = {
      storey,
      edge,
      type,
      width,
      height,
      ...(sill !== (type === "door" ? 0 : 0.9) ? { sill } : type === "door" ? { sill: 0 } : { sill }),
      ...(count > 1 ? { count } : {}),
    };

    const validation = validateOpening(opening, mass);
    if (!validation.valid) {
      setError(validation.error ?? "Invalid opening");
      return;
    }
    setError(null);

    if (existingIndex != null) {
      dispatch({ type: "UPDATE_OPENING", massId, index: existingIndex, opening });
    } else {
      dispatch({ type: "ADD_OPENING", massId, opening });
    }
  };

  return (
    <div className="property-controls">
      <h3>{existingIndex != null ? "Edit Opening" : "Add Opening"}</h3>

      <div className="opening-form-context">
        Wall length: {wallLen.toFixed(1)}m, Storey height: {storeyHeight.toFixed(1)}m
      </div>

      <div className="prop-row">
        <label>Type</label>
        <select value={type} onChange={(e) => handleTypeChange(e.target.value as "window" | "door")}>
          <option value="window">Window</option>
          <option value="door">Door</option>
        </select>
      </div>

      <div className="prop-row">
        <label>Width (m)</label>
        <input
          type="number"
          min={0.1}
          max={wallLen}
          step={0.1}
          value={width}
          onChange={(e) => setWidth(Number(e.target.value))}
        />
      </div>

      <div className="prop-row">
        <label>Height (m)</label>
        <input
          type="number"
          min={0.1}
          max={storeyHeight}
          step={0.1}
          value={height}
          onChange={(e) => setHeight(Number(e.target.value))}
        />
      </div>

      <div className="prop-row">
        <label>Sill (m)</label>
        <input
          type="number"
          min={0}
          max={storeyHeight - height}
          step={0.1}
          value={sill}
          onChange={(e) => setSill(Number(e.target.value))}
        />
      </div>

      <div className="prop-row">
        <label>Count</label>
        <div className="prop-spinner">
          <button
            disabled={count <= 1}
            onClick={() => setCount(Math.max(1, count - 1))}
          >
            −
          </button>
          <span>{count}</span>
          <button
            disabled={count >= 10}
            onClick={() => setCount(Math.min(10, count + 1))}
          >
            +
          </button>
        </div>
      </div>

      {error && <div className="opening-form-error">{error}</div>}

      <button className="opening-form-submit" onClick={handleSubmit}>
        {existingIndex != null ? "Update" : "Add"}
      </button>
    </div>
  );
}
