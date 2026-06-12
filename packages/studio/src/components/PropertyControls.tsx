import type { Dispatch } from "react";
import type { Vec2, RoofCut } from "@sap-geometry/core";
import type { DesignState, RoofConfig } from "../lib/types";
import type { RidgeGraph } from "../lib/ridgeGraph";
import type { StudioAction } from "../lib/reducer";

interface PropertyControlsProps {
  design: DesignState;
  onDesignChange: (d: DesignState) => void;
  edgeCount: number;
  vertices: Vec2[];
  massId: string;
  ridgeGraph?: RidgeGraph;
  roofCuts?: RoofCut[];
  abutMasses?: { id: string; name: string }[];
  dispatch: Dispatch<StudioAction>;
}

export function PropertyControls({
  design, onDesignChange, edgeCount, vertices, massId, ridgeGraph, roofCuts, abutMasses, dispatch,
}: PropertyControlsProps) {
  const storeyCount = design.storeys.length;
  const isCustomRoof = !!ridgeGraph;

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

  const isCutsMode = design.roof.type === "cuts";
  const showPitch = !isCustomRoof && !isCutsMode && design.roof.type !== "flat";
  const showRidgeEdge = !isCustomRoof && !isCutsMode && (design.roof.type === "mono" || design.roof.type === "dual");
  const canCustomize = design.roof.type !== "flat" && !isCutsMode;

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
          onChange={(e) => {
            const newType = e.target.value as RoofConfig["type"];
            setRoof({ type: newType });
            // Clear ridge graph when changing type
            if (isCustomRoof) {
              dispatch({ type: "SET_ROOF_MODE", massId, mode: "parametric" });
            }
          }}
        >
          <option value="flat">flat</option>
          <option value="mono">mono</option>
          <option value="dual">dual</option>
          <option value="hip">hip</option>
          <option value="cuts">cuts</option>
        </select>
      </div>

      {/* Roof mode toggle */}
      {canCustomize && (
        <div className="prop-row">
          <label>Mode</label>
          <select
            value={isCustomRoof ? "custom" : "parametric"}
            onChange={(e) => {
              dispatch({
                type: "SET_ROOF_MODE",
                massId,
                mode: e.target.value as "parametric" | "custom",
              });
            }}
          >
            <option value="parametric">parametric</option>
            <option value="custom">custom</option>
          </select>
        </div>
      )}

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

      {/* Ridge node z-height controls (custom mode) */}
      {isCustomRoof && ridgeGraph.nodes.length > 0 && (
        <>
          <h3 style={{ marginTop: 12 }}>Ridge Nodes</h3>
          {ridgeGraph.nodes.map((node) => (
            <div className="prop-row" key={node.id}>
              <label>{node.id}</label>
              <input
                type="number"
                min={0.1}
                max={20}
                step={0.1}
                value={parseFloat(node.z.toFixed(2))}
                onChange={(e) => {
                  const z = parseFloat(e.target.value);
                  if (!isNaN(z) && z > 0) {
                    dispatch({
                      type: "UPDATE_RIDGE_NODE",
                      massId,
                      nodeId: node.id,
                      z,
                    });
                  }
                }}
              />
            </div>
          ))}
        </>
      )}

      {/* Cut-plane roof controls */}
      {isCutsMode && (
        <>
          <h3 style={{ marginTop: 12 }}>Cuts</h3>
          {/* One-click presets */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            <button
              style={{ fontSize: "0.8em", padding: "3px 8px" }}
              onClick={() => {
                if (vertices.length < 2) return;
                // Dual from edge 0: two opposing cuts
                const a0 = vertices[0];
                const b0 = vertices[1];
                // Find the edge opposite to edge 0 (edge at floor(n/2))
                const oppIdx = Math.floor(vertices.length / 2);
                const a1 = vertices[(oppIdx + 1) % vertices.length];
                const b1 = vertices[oppIdx];
                let id = Date.now();
                dispatch({ type: "ADD_CUT", massId, cut: { id: `cut_d${id}`, a: a0, b: b0, side: "left", pitch: 35 } });
                dispatch({ type: "ADD_CUT", massId, cut: { id: `cut_d${id + 1}`, a: a1, b: b1, side: "left", pitch: 35 } });
              }}
            >
              Dual
            </button>
            <button
              style={{ fontSize: "0.8em", padding: "3px 8px" }}
              onClick={() => {
                if (vertices.length < 3) return;
                // Hip: one cut per footprint edge, all rising inward
                const n = vertices.length;
                const id = Date.now();
                for (let i = 0; i < n; i++) {
                  const a = vertices[i];
                  const b = vertices[(i + 1) % n];
                  dispatch({ type: "ADD_CUT", massId, cut: { id: `cut_h${id}_${i}`, a, b, side: "left", pitch: 35 } });
                }
              }}
            >
              Hip
            </button>
          </div>
          <p style={{ fontSize: "0.85em", opacity: 0.7, margin: "4px 0 8px" }}>
            Click canvas to add a cut (2 clicks).
          </p>
          {(roofCuts ?? []).map((cut) => {
            const wallTopZ = design.storeys.reduce((s, st) => s + st.height, 0);
            return (
              <div key={cut.id} style={{ border: "1px solid #444", borderRadius: 4, padding: 6, marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <strong style={{ fontSize: "0.85em" }}>{cut.id}</strong>
                  <button
                    style={{ fontSize: "0.8em", padding: "1px 6px" }}
                    onClick={() => dispatch({ type: "DELETE_CUT", massId, cutId: cut.id })}
                    title="Delete cut"
                  >
                    ×
                  </button>
                </div>
                <div className="prop-row">
                  <label>Pitch</label>
                  <input
                    type="number"
                    min={1}
                    max={89}
                    step={1}
                    value={cut.pitch}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 1 && v <= 89) {
                        dispatch({ type: "UPDATE_CUT", massId, cutId: cut.id, patch: { pitch: v } });
                      }
                    }}
                    style={{ width: 60 }}
                  />
                </div>
                <div className="prop-row">
                  <label>Eaves Z</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.1}
                    value={cut.eavesZ ?? wallTopZ}
                    placeholder={wallTopZ.toFixed(1)}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v > 0) {
                        dispatch({
                          type: "UPDATE_CUT",
                          massId,
                          cutId: cut.id,
                          patch: { eavesZ: Math.abs(v - wallTopZ) < 0.001 ? undefined : v },
                        });
                      }
                    }}
                    style={{ width: 60 }}
                  />
                </div>
                <div className="prop-row">
                  <label>Side</label>
                  <button
                    style={{ fontSize: "0.8em", padding: "2px 8px" }}
                    onClick={() =>
                      dispatch({
                        type: "UPDATE_CUT",
                        massId,
                        cutId: cut.id,
                        patch: { side: cut.side === "left" ? "right" : "left" },
                      })
                    }
                  >
                    {cut.side} ↔
                  </button>
                </div>
                {abutMasses && abutMasses.length > 0 && (
                  <div className="prop-row">
                    <label>Copy to</label>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {abutMasses.map((am) => (
                        <button
                          key={am.id}
                          style={{ fontSize: "0.8em", padding: "2px 6px" }}
                          onClick={() => {
                            dispatch({
                              type: "ADD_CUT",
                              massId: am.id,
                              cut: { ...cut, id: `${cut.id}_${am.id}` },
                            });
                          }}
                          title={`Copy this cut to ${am.name}`}
                        >
                          {am.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
