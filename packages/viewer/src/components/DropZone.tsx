import { useState, useCallback, useEffect } from "react";
import type { BuildingSpec } from "@sap-geometry/core";

// Inline fixtures to avoid async loading issues
const HELLO_BOX: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "flat" },
    },
  ],
};

const L_PLAN: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 4], [4, 4], [4, 8], [0, 8]],
      storeys: [{ height: 2.4 }],
      roof: { type: "flat" },
    },
  ],
};

const DUAL_PITCH: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "dual", pitch: 35, ridgeEdge: 0 },
    },
  ],
};

const HIP_ROOF: BuildingSpec = {
  masses: [
    {
      footprint: [[0, 0], [10, 0], [10, 6], [0, 6]],
      storeys: [{ height: 2.4 }],
      roof: { type: "hip", pitch: 35 },
    },
  ],
};

const DORMER_COTTAGE: BuildingSpec = {
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
};

const ABUTTING_BOXES: BuildingSpec = {
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
};

const CHURCH: BuildingSpec = {
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
};

const TWO_STOREY_HIP: BuildingSpec = {
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
};

interface DropZoneProps {
  onLoad: (spec: BuildingSpec) => void;
}

export function DropZone({ onLoad }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (text: string) => {
      try {
        const spec = JSON.parse(text) as BuildingSpec;
        if (!spec.masses || !Array.isArray(spec.masses)) {
          alert("Invalid spec: missing 'masses' array");
          return;
        }
        onLoad(spec);
      } catch {
        alert("Failed to parse JSON");
      }
    },
    [onLoad],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        file.text().then(handleFile);
      }
    },
    [handleFile],
  );

  // Listen for paste events
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text");
      if (text) handleFile(text);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [handleFile]);

  return (
    <div
      className={`dropzone ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <p>Drop a .spec.json file here, or paste JSON</p>
      <div className="fixtures">
        <button onClick={() => onLoad(HELLO_BOX)}>hello-box</button>
        <button onClick={() => onLoad(L_PLAN)}>l-plan</button>
        <button onClick={() => onLoad(DUAL_PITCH)}>dual-pitch</button>
        <button onClick={() => onLoad(HIP_ROOF)}>hip-roof</button>
        <button onClick={() => onLoad(DORMER_COTTAGE)}>dormer cottage</button>
        <button onClick={() => onLoad(ABUTTING_BOXES)}>abutting boxes</button>
        <button onClick={() => onLoad(CHURCH)}>church</button>
        <button onClick={() => onLoad(TWO_STOREY_HIP)}>2-storey hip</button>
      </div>
    </div>
  );
}
