import type { Dispatch } from "react";
import type { MassDesign } from "../lib/types";
import type { StudioAction } from "../lib/reducer";

interface OpeningsTableProps {
  mass: MassDesign;
  dispatch: Dispatch<StudioAction>;
}

export function OpeningsTable({ mass, dispatch }: OpeningsTableProps) {
  if (!mass.openings?.length) return null;

  return (
    <div className="openings-table">
      <h3>Openings</h3>
      {mass.openings.map((o, i) => {
        const faceId = `${mass.id}_wall_s${o.storey}_e${o.edge}`;
        return (
          <div key={i} className="opening-row">
            <span className="opening-row-info">
              S{o.storey} E{o.edge} {o.type} {o.width}×{o.height}
              {(o.count ?? 1) > 1 ? ` ×${o.count}` : ""}
            </span>
            <span className="opening-row-actions">
              <button
                className="opening-edit-btn"
                title="Edit opening"
                onClick={() =>
                  dispatch({ type: "SET_SELECTED_FACE", id: faceId })
                }
              >
                edit
              </button>
              <button
                className="opening-delete-btn"
                title="Delete opening"
                onClick={() =>
                  dispatch({ type: "REMOVE_OPENING", massId: mass.id, index: i })
                }
              >
                ×
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
