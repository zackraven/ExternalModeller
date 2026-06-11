import { describe, it, expect, beforeEach } from "vitest";
import { studioReducer, massDesignsFromSpec } from "../reducer";
import type { StudioAction } from "../reducer";
import { defaultStudioState, resetMassCounter } from "../types";
import type { StudioState } from "../types";
import type { BuildingSpec } from "@sap-geometry/core";

function dispatch(state: StudioState, action: StudioAction): StudioState {
  return studioReducer(state, action);
}

function dispatchMany(state: StudioState, actions: StudioAction[]): StudioState {
  return actions.reduce((s, a) => studioReducer(s, a), state);
}

beforeEach(() => {
  resetMassCounter();
});

describe("ADD_MASS", () => {
  it("creates a new mass and sets it active", () => {
    const s0 = defaultStudioState();
    const s1 = dispatch(s0, { type: "ADD_MASS" });
    expect(s1.masses).toHaveLength(1);
    expect(s1.masses[0].closed).toBe(false);
    expect(s1.masses[0].vertices).toEqual([]);
    expect(s1.activeMassId).toBe(s1.masses[0].id);
  });

  it("does not add a mass if one is already being drawn", () => {
    const s0 = defaultStudioState();
    const s1 = dispatch(s0, { type: "ADD_MASS" });
    const s2 = dispatch(s1, { type: "ADD_MASS" });
    expect(s2.masses).toHaveLength(1);
  });

  it("clears selectedFaceId", () => {
    let s = defaultStudioState();
    s = { ...s, selectedFaceId: "some_face" };
    s = dispatch(s, { type: "ADD_MASS" });
    expect(s.selectedFaceId).toBeNull();
  });
});

describe("ADD_VERTEX", () => {
  it("appends vertex to active mass", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
    ]);
    expect(s.masses[0].vertices).toEqual([[0, 0], [10, 0]]);
  });

  it("does nothing if active mass is closed", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
      { type: "ADD_VERTEX", vertex: [99, 99] },
    ]);
    expect(s.masses[0].vertices).toHaveLength(3);
  });
});

describe("CLOSE_MASS", () => {
  it("closes active mass with >= 3 vertices", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    expect(s.masses[0].closed).toBe(true);
  });

  it("does nothing with < 3 vertices", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "CLOSE_MASS" },
    ]);
    expect(s.masses[0].closed).toBe(false);
  });

  it("clears selectedFaceId", () => {
    let s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
    ]);
    s = { ...s, selectedFaceId: "foo" };
    s = dispatch(s, { type: "CLOSE_MASS" });
    expect(s.selectedFaceId).toBeNull();
  });
});

describe("REMOVE_MASS", () => {
  it("removes mass by id", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    const s2 = dispatch(s, { type: "REMOVE_MASS", id });
    expect(s2.masses).toHaveLength(0);
    expect(s2.activeMassId).toBeNull();
  });

  it("updates activeMassId when active mass is removed", () => {
    // Load a multi-mass fixture
    const spec: BuildingSpec = {
      masses: [
        { footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
        { footprint: [[10,0],[20,0],[20,6],[10,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
      ],
    };
    let s = dispatch(defaultStudioState(), { type: "LOAD_FIXTURE", spec });
    // Activate second mass then remove it
    s = dispatch(s, { type: "SET_ACTIVE_MASS", id: s.masses[1].id });
    const removedId = s.masses[1].id;
    s = dispatch(s, { type: "REMOVE_MASS", id: removedId });
    expect(s.masses).toHaveLength(1);
    expect(s.activeMassId).toBe(s.masses[0].id);
  });
});

describe("MOVE_VERTEX", () => {
  it("updates a specific vertex position", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    const s2 = dispatch(s, { type: "MOVE_VERTEX", massId: id, index: 1, pos: [12, 0] });
    expect(s2.masses[0].vertices[1]).toEqual([12, 0]);
    expect(s2.masses[0].vertices[0]).toEqual([0, 0]);
  });
});

describe("UPDATE_MASS", () => {
  it("merges patch into mass", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    const s2 = dispatch(s, {
      type: "UPDATE_MASS",
      id,
      patch: {
        storeys: [{ height: 3.0 }, { height: 2.7 }],
        roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
      },
    });
    expect(s2.masses[0].storeys).toEqual([{ height: 3.0 }, { height: 2.7 }]);
    expect(s2.masses[0].roof.type).toBe("dual");
  });
});

describe("RENAME_MASS", () => {
  it("updates mass name", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    const s2 = dispatch(s, { type: "RENAME_MASS", id, name: "Kitchen" });
    expect(s2.masses[0].name).toBe("Kitchen");
  });
});

describe("SET_ACTIVE_MASS", () => {
  it("switches to a closed mass", () => {
    const spec: BuildingSpec = {
      masses: [
        { footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
        { footprint: [[10,0],[20,0],[20,6],[10,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
      ],
    };
    let s = dispatch(defaultStudioState(), { type: "LOAD_FIXTURE", spec });
    expect(s.activeMassId).toBe(s.masses[0].id);
    s = dispatch(s, { type: "SET_ACTIVE_MASS", id: s.masses[1].id });
    expect(s.activeMassId).toBe(s.masses[1].id);
  });

  it("auto-removes empty drawing mass on switch", () => {
    const spec: BuildingSpec = {
      masses: [
        { footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
      ],
    };
    let s = dispatch(defaultStudioState(), { type: "LOAD_FIXTURE", spec });
    // Add a new drawing mass (empty)
    s = dispatch(s, { type: "ADD_MASS" });
    expect(s.masses).toHaveLength(2);
    // Switch back to first
    s = dispatch(s, { type: "SET_ACTIVE_MASS", id: s.masses[0].id });
    expect(s.masses).toHaveLength(1); // empty drawing mass removed
  });
});

describe("UNDO_VERTEX", () => {
  it("pops last vertex", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "UNDO_VERTEX" },
    ]);
    expect(s.masses[0].vertices).toEqual([[0, 0]]);
  });

  it("removes mass when last vertex is undone", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "UNDO_VERTEX" },
    ]);
    expect(s.masses).toHaveLength(0);
    expect(s.activeMassId).toBeNull();
  });

  it("does nothing for closed mass", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
      { type: "UNDO_VERTEX" },
    ]);
    expect(s.masses[0].vertices).toHaveLength(3);
  });
});

describe("LOAD_FIXTURE", () => {
  it("loads single-mass fixture", () => {
    const spec: BuildingSpec = {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
        },
      ],
    };
    const s = dispatch(defaultStudioState(), { type: "LOAD_FIXTURE", spec });
    expect(s.masses).toHaveLength(1);
    expect(s.masses[0].closed).toBe(true);
    expect(s.masses[0].vertices).toEqual([[0, 0], [10, 0], [10, 6], [0, 6]]);
    expect(s.masses[0].roof.type).toBe("dual");
    expect(s.activeMassId).toBe(s.masses[0].id);
  });

  it("loads multi-mass fixture", () => {
    const spec: BuildingSpec = {
      masses: [
        {
          id: "nave",
          footprint: [[0, 0], [20, 0], [20, 10], [0, 10]],
          storeys: [{ height: 5 }],
          roof: { type: "dual", pitch: 40, ridgeEdge: 0 },
          openings: [
            { storey: 0, edge: 0, type: "window", width: 1.0, height: 2.8, sill: 1.5, count: 5 },
          ],
        },
        {
          id: "tower",
          footprint: [[-4, 3], [0, 3], [0, 7], [-4, 7]],
          storeys: [{ height: 5 }, { height: 4 }, { height: 4 }],
          roof: { type: "hip", pitch: 75 },
        },
      ],
    };
    const s = dispatch(defaultStudioState(), { type: "LOAD_FIXTURE", spec });
    expect(s.masses).toHaveLength(2);
    expect(s.masses[0].id).toBe("nave");
    expect(s.masses[1].id).toBe("tower");
    expect(s.masses[0].openings).toHaveLength(1);
    expect(s.masses[1].storeys).toHaveLength(3);
    expect(s.masses[1].roof.type).toBe("hip");
    expect(s.activeMassId).toBe("nave");
  });

  it("resets showOverlay", () => {
    let s = defaultStudioState();
    s = { ...s, showOverlay: true };
    s = dispatch(s, {
      type: "LOAD_FIXTURE",
      spec: { masses: [{ footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } }] },
    });
    expect(s.showOverlay).toBe(false);
  });
});

describe("CLEAR_ALL", () => {
  it("resets to default state", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
      { type: "CLEAR_ALL" },
    ]);
    expect(s.masses).toHaveLength(0);
    expect(s.activeMassId).toBeNull();
    expect(s.selectedFaceId).toBeNull();
    expect(s.showOverlay).toBe(false);
  });
});

describe("SET_SELECTED_FACE", () => {
  it("sets selectedFaceId", () => {
    const s = dispatch(defaultStudioState(), { type: "SET_SELECTED_FACE", id: "some_id" });
    expect(s.selectedFaceId).toBe("some_id");
  });

  it("clears selectedFaceId with null", () => {
    let s = dispatch(defaultStudioState(), { type: "SET_SELECTED_FACE", id: "some_id" });
    s = dispatch(s, { type: "SET_SELECTED_FACE", id: null });
    expect(s.selectedFaceId).toBeNull();
  });
});

describe("TOGGLE_OVERLAY", () => {
  it("toggles showOverlay", () => {
    const s0 = defaultStudioState();
    expect(s0.showOverlay).toBe(false);
    const s1 = dispatch(s0, { type: "TOGGLE_OVERLAY" });
    expect(s1.showOverlay).toBe(true);
    const s2 = dispatch(s1, { type: "TOGGLE_OVERLAY" });
    expect(s2.showOverlay).toBe(false);
  });
});

describe("ADD_OPENING", () => {
  it("appends opening to mass", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    const s2 = dispatch(s, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
    });
    expect(s2.masses[0].openings).toHaveLength(1);
    expect(s2.masses[0].openings![0].type).toBe("window");
  });

  it("creates openings array if missing", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    expect(s.masses[0].openings).toBeUndefined();
    const id = s.masses[0].id;
    const s2 = dispatch(s, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 0, type: "door", width: 0.9, height: 2.1 },
    });
    expect(s2.masses[0].openings).toHaveLength(1);
  });
});

describe("UPDATE_OPENING", () => {
  it("replaces opening at index", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    let s2 = dispatch(s, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
    });
    s2 = dispatch(s2, {
      type: "UPDATE_OPENING",
      massId: id,
      index: 0,
      opening: { storey: 0, edge: 0, type: "door", width: 0.9, height: 2.1 },
    });
    expect(s2.masses[0].openings).toHaveLength(1);
    expect(s2.masses[0].openings![0].type).toBe("door");
  });
});

describe("REMOVE_OPENING", () => {
  it("removes opening at index", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    let s2 = dispatch(s, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
    });
    s2 = dispatch(s2, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 1, type: "door", width: 0.9, height: 2.1 },
    });
    expect(s2.masses[0].openings).toHaveLength(2);
    s2 = dispatch(s2, { type: "REMOVE_OPENING", massId: id, index: 0 });
    expect(s2.masses[0].openings).toHaveLength(1);
    expect(s2.masses[0].openings![0].type).toBe("door");
  });

  it("sets openings to undefined when last one removed", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    let s2 = dispatch(s, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
    });
    s2 = dispatch(s2, { type: "REMOVE_OPENING", massId: id, index: 0 });
    expect(s2.masses[0].openings).toBeUndefined();
  });
});

describe("cleanOpenings on UPDATE_MASS", () => {
  it("removes openings on non-existent storeys after storey reduction", () => {
    const s = dispatchMany(defaultStudioState(), [
      { type: "ADD_MASS" },
      { type: "ADD_VERTEX", vertex: [0, 0] },
      { type: "ADD_VERTEX", vertex: [10, 0] },
      { type: "ADD_VERTEX", vertex: [10, 6] },
      { type: "CLOSE_MASS" },
    ]);
    const id = s.masses[0].id;
    // Add 2 storeys, then add opening on storey 1
    let s2 = dispatch(s, {
      type: "UPDATE_MASS",
      id,
      patch: { storeys: [{ height: 2.4 }, { height: 2.4 }] },
    });
    s2 = dispatch(s2, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 },
    });
    s2 = dispatch(s2, {
      type: "ADD_OPENING",
      massId: id,
      opening: { storey: 1, edge: 0, type: "window", width: 1.0, height: 1.0, sill: 0.5 },
    });
    expect(s2.masses[0].openings).toHaveLength(2);
    // Reduce to 1 storey — opening on storey 1 should be cleaned
    s2 = dispatch(s2, {
      type: "UPDATE_MASS",
      id,
      patch: { storeys: [{ height: 2.4 }] },
    });
    expect(s2.masses[0].openings).toHaveLength(1);
    expect(s2.masses[0].openings![0].storey).toBe(0);
  });
});

describe("massDesignsFromSpec", () => {
  it("converts masses preserving ids", () => {
    const spec: BuildingSpec = {
      masses: [
        { id: "main", footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
        { id: "ext", footprint: [[10,0],[15,0],[15,6],[10,6]], storeys: [{ height: 2.4 }], roof: { type: "hip", pitch: 30 } },
      ],
    };
    const designs = massDesignsFromSpec(spec);
    expect(designs).toHaveLength(2);
    expect(designs[0].id).toBe("main");
    expect(designs[1].id).toBe("ext");
    expect(designs[1].roof.type).toBe("hip");
    expect(designs[1].roof.pitch).toBe(30);
  });

  it("generates ids for masses without explicit id", () => {
    const spec: BuildingSpec = {
      masses: [
        { footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "flat" } },
      ],
    };
    const designs = massDesignsFromSpec(spec);
    expect(designs[0].id).toBe("mass_1");
  });

  it("maps 'none' roof to 'flat'", () => {
    const spec: BuildingSpec = {
      masses: [
        { footprint: [[0,0],[10,0],[10,6],[0,6]], storeys: [{ height: 2.4 }], roof: { type: "none" } },
      ],
    };
    const designs = massDesignsFromSpec(spec);
    expect(designs[0].roof.type).toBe("flat");
  });

  it("preserves openings and components", () => {
    const spec: BuildingSpec = {
      masses: [
        {
          footprint: [[0,0],[10,0],[10,6],[0,6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
          openings: [{ storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9 }],
          components: [{ kind: "dormer", roofPlane: 0, shape: "gable", width: 2, height: 1.5 }],
        },
      ],
    };
    const designs = massDesignsFromSpec(spec);
    expect(designs[0].openings).toHaveLength(1);
    expect(designs[0].components).toHaveLength(1);
  });
});
