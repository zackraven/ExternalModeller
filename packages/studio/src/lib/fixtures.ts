import type { BuildingSpec } from "@sap-geometry/core";

export const FIXTURES: { label: string; spec: BuildingSpec }[] = [
  {
    label: "hello-box",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "flat" },
        },
      ],
    },
  },
  {
    label: "l-plan",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]],
          storeys: [{ height: 2.4 }],
          roof: { type: "flat" },
        },
      ],
    },
  },
  {
    label: "dual-pitch",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
        },
      ],
    },
  },
  {
    label: "hip-roof",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "hip", pitch: 35 },
        },
      ],
    },
  },
  {
    label: "dormer cottage",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
          openings: [
            { storey: 0, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.9, count: 3 },
            { storey: 0, edge: 2, type: "window", width: 1.2, height: 1.2, sill: 0.9, count: 2 },
            { storey: 0, edge: 1, type: "door", width: 0.9, height: 2.1 },
          ],
          components: [
            {
              kind: "dormer",
              roofPlane: 0,
              shape: "gable",
              width: 2,
              height: 1.5,
              window: { width: 1.2, height: 1.0 },
            },
          ],
        },
      ],
    },
  },
  {
    label: "abutting boxes",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "flat" },
        },
        {
          footprint: [[10, 0], [20, 0], [20, 6], [10, 6]],
          storeys: [{ height: 2.4 }],
          roof: { type: "flat" },
        },
      ],
    },
  },
  {
    label: "church",
    spec: {
      masses: [
        {
          id: "nave",
          footprint: [[0, 0], [20, 0], [20, 10], [0, 10]],
          storeys: [{ height: 5 }],
          roof: { type: "dual", pitch: 40, ridgeEdge: 0 },
          openings: [
            { storey: 0, edge: 0, type: "window", width: 1.0, height: 2.8, sill: 1.5, count: 5 },
            { storey: 0, edge: 1, type: "window", width: 2.0, height: 3.5, sill: 1.0 },
            { storey: 0, edge: 2, type: "window", width: 1.0, height: 2.8, sill: 1.5, count: 5 },
          ],
        },
        {
          id: "tower",
          footprint: [[-4, 3], [0, 3], [0, 7], [-4, 7]],
          storeys: [{ height: 5 }, { height: 4 }, { height: 4 }],
          roof: { type: "hip", pitch: 75 },
          openings: [
            { storey: 0, edge: 3, type: "door", width: 1.8, height: 3.5 },
            { storey: 0, edge: 0, type: "window", width: 0.6, height: 2.0, sill: 1.5 },
            { storey: 0, edge: 2, type: "window", width: 0.6, height: 2.0, sill: 1.5 },
            { storey: 1, edge: 0, type: "window", width: 0.6, height: 1.5, sill: 1.0 },
            { storey: 1, edge: 2, type: "window", width: 0.6, height: 1.5, sill: 1.0 },
            { storey: 1, edge: 3, type: "window", width: 0.6, height: 1.5, sill: 1.0 },
            { storey: 2, edge: 0, type: "window", width: 0.5, height: 1.0, sill: 1.2 },
            { storey: 2, edge: 2, type: "window", width: 0.5, height: 1.0, sill: 1.2 },
            { storey: 2, edge: 3, type: "window", width: 0.5, height: 1.0, sill: 1.2 },
          ],
        },
      ],
    },
  },
  {
    label: "2-storey hip",
    spec: {
      masses: [
        {
          footprint: [[0, 0], [12, 0], [12, 8], [0, 8]],
          storeys: [{ height: 2.7 }, { height: 2.4 }],
          roof: { type: "hip", pitch: 30 },
          openings: [
            { storey: 0, edge: 0, type: "window", width: 1.4, height: 1.4, sill: 0.9, count: 3 },
            { storey: 0, edge: 2, type: "window", width: 1.4, height: 1.4, sill: 0.9, count: 3 },
            { storey: 0, edge: 3, type: "door", width: 1.0, height: 2.1 },
            { storey: 1, edge: 0, type: "window", width: 1.2, height: 1.2, sill: 0.8, count: 3 },
            { storey: 1, edge: 2, type: "window", width: 1.2, height: 1.2, sill: 0.8, count: 3 },
          ],
          components: [
            {
              kind: "rooflight",
              roofPlane: 0,
              width: 1.2,
              height: 0.8,
            },
          ],
        },
      ],
    },
  },
];
