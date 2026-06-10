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
      </div>
    </div>
  );
}
