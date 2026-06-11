import type { Vec2, BuildingSpec, Mass, Opening } from "@sap-geometry/core";
import type { MassDesign, StudioState, RoofConfig } from "./types";
import { defaultMass, defaultStudioState, generateMassId } from "./types";
import { DEFAULT_STOREY_HEIGHT } from "./constants";

// ── Actions ─────────────────────────────────────

export type StudioAction =
  | { type: "ADD_MASS" }
  | { type: "REMOVE_MASS"; id: string }
  | { type: "SET_ACTIVE_MASS"; id: string }
  | { type: "RENAME_MASS"; id: string; name: string }
  | { type: "UPDATE_MASS"; id: string; patch: Partial<MassDesign> }
  | { type: "ADD_VERTEX"; vertex: Vec2 }
  | { type: "CLOSE_MASS" }
  | { type: "UNDO_VERTEX" }
  | { type: "MOVE_VERTEX"; massId: string; index: number; pos: Vec2 }
  | { type: "ADD_OPENING"; massId: string; opening: Opening }
  | { type: "UPDATE_OPENING"; massId: string; index: number; opening: Opening }
  | { type: "REMOVE_OPENING"; massId: string; index: number }
  | { type: "LOAD_FIXTURE"; spec: BuildingSpec }
  | { type: "CLEAR_ALL" }
  | { type: "SET_SELECTED_FACE"; id: string | null }
  | { type: "TOGGLE_OVERLAY" };

// ── Helpers ─────────────────────────────────────

function hasDrawingMass(state: StudioState): boolean {
  return state.masses.some((m) => !m.closed);
}

function polygonArea(verts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    a += verts[i][0] * verts[j][1] - verts[j][0] * verts[i][1];
  }
  return Math.abs(a) / 2;
}

/** Remove openings referencing non-existent storeys or edges. */
function cleanOpenings(mass: MassDesign): Opening[] | undefined {
  if (!mass.openings?.length) return mass.openings;
  const maxStorey = mass.storeys.length - 1;
  const maxEdge = mass.vertices.length - 1;
  const kept = mass.openings.filter(
    (o) => o.storey >= 0 && o.storey <= maxStorey && o.edge >= 0 && o.edge <= maxEdge,
  );
  return kept.length > 0 ? kept : undefined;
}

export function massDesignsFromSpec(spec: BuildingSpec): MassDesign[] {
  return spec.masses.map((mass: Mass, i: number) => {
    const id = mass.id ?? generateMassId();
    const roofType = mass.roof?.type ?? "flat";
    const mappedType: RoofConfig["type"] =
      (roofType === "none" || roofType === "custom") ? "flat" : roofType;

    const design: MassDesign = {
      id,
      name: id,
      vertices: mass.footprint,
      closed: true,
      storeys: mass.storeys,
      roof: {
        type: mappedType,
        pitch: (mass.roof && "pitch" in mass.roof && mass.roof.pitch) || 35,
        ridgeEdge:
          (mass.roof && "ridgeEdge" in mass.roof && mass.roof.ridgeEdge) || 0,
      },
    };
    if (mass.openings?.length) design.openings = mass.openings;
    if (mass.components?.length) design.components = mass.components;
    return design;
  });
}

// ── Reducer ─────────────────────────────────────

export function studioReducer(
  state: StudioState,
  action: StudioAction,
): StudioState {
  switch (action.type) {
    case "ADD_MASS": {
      // Don't add a new mass if there's already a drawing (unclosed) mass
      if (hasDrawingMass(state)) return state;
      const mass = defaultMass();
      return {
        ...state,
        masses: [...state.masses, mass],
        activeMassId: mass.id,
        selectedFaceId: null,
      };
    }

    case "REMOVE_MASS": {
      const masses = state.masses.filter((m) => m.id !== action.id);
      let activeMassId = state.activeMassId;
      if (activeMassId === action.id) {
        // Activate the first closed mass, or null
        const firstClosed = masses.find((m) => m.closed);
        activeMassId = firstClosed?.id ?? null;
      }
      return {
        ...state,
        masses,
        activeMassId,
        selectedFaceId: null,
      };
    }

    case "SET_ACTIVE_MASS": {
      // Only switch to closed masses; auto-remove empty drawing mass
      const target = state.masses.find((m) => m.id === action.id);
      if (!target || !target.closed) return state;

      let masses = state.masses;
      // Remove any empty drawing mass (unclosed with 0 vertices)
      const drawing = masses.find((m) => !m.closed);
      if (drawing && drawing.vertices.length === 0) {
        masses = masses.filter((m) => m.id !== drawing.id);
      }

      return {
        ...state,
        masses,
        activeMassId: action.id,
        selectedFaceId: null,
      };
    }

    case "RENAME_MASS": {
      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === action.id ? { ...m, name: action.name } : m,
        ),
      };
    }

    case "UPDATE_MASS": {
      return {
        ...state,
        masses: state.masses.map((m) => {
          if (m.id !== action.id) return m;
          const updated = { ...m, ...action.patch };
          updated.openings = cleanOpenings(updated);
          return updated;
        }),
        selectedFaceId: null,
      };
    }

    case "ADD_VERTEX": {
      const active = state.masses.find((m) => m.id === state.activeMassId);
      if (!active || active.closed) return state;
      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === state.activeMassId
            ? { ...m, vertices: [...m.vertices, action.vertex] }
            : m,
        ),
      };
    }

    case "CLOSE_MASS": {
      const active = state.masses.find((m) => m.id === state.activeMassId);
      if (!active || active.closed || active.vertices.length < 3) return state;
      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === state.activeMassId ? { ...m, closed: true } : m,
        ),
        selectedFaceId: null,
      };
    }

    case "UNDO_VERTEX": {
      const active = state.masses.find((m) => m.id === state.activeMassId);
      if (!active || active.closed) return state;

      if (active.vertices.length <= 1) {
        // Remove the mass entirely
        const masses = state.masses.filter(
          (m) => m.id !== state.activeMassId,
        );
        const firstClosed = masses.find((m) => m.closed);
        return {
          ...state,
          masses,
          activeMassId: firstClosed?.id ?? null,
        };
      }

      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === state.activeMassId
            ? { ...m, vertices: m.vertices.slice(0, -1) }
            : m,
        ),
      };
    }

    case "MOVE_VERTEX": {
      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === action.massId
            ? {
                ...m,
                vertices: m.vertices.map((v, i) =>
                  i === action.index ? action.pos : v,
                ),
              }
            : m,
        ),
        selectedFaceId: null,
      };
    }

    case "ADD_OPENING": {
      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === action.massId
            ? { ...m, openings: [...(m.openings ?? []), action.opening] }
            : m,
        ),
      };
    }

    case "UPDATE_OPENING": {
      return {
        ...state,
        masses: state.masses.map((m) =>
          m.id === action.massId
            ? {
                ...m,
                openings: (m.openings ?? []).map((o, i) =>
                  i === action.index ? action.opening : o,
                ),
              }
            : m,
        ),
      };
    }

    case "REMOVE_OPENING": {
      return {
        ...state,
        masses: state.masses.map((m) => {
          if (m.id !== action.massId) return m;
          const openings = (m.openings ?? []).filter((_, i) => i !== action.index);
          return { ...m, openings: openings.length > 0 ? openings : undefined };
        }),
      };
    }

    case "LOAD_FIXTURE": {
      const designs = massDesignsFromSpec(action.spec);
      return {
        ...state,
        masses: designs,
        activeMassId: designs[0]?.id ?? null,
        selectedFaceId: null,
        showOverlay: false,
      };
    }

    case "CLEAR_ALL": {
      return defaultStudioState();
    }

    case "SET_SELECTED_FACE": {
      return { ...state, selectedFaceId: action.id };
    }

    case "TOGGLE_OVERLAY": {
      return { ...state, showOverlay: !state.showOverlay };
    }

    default:
      return state;
  }
}
