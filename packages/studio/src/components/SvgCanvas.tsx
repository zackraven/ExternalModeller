import { useState, useRef, useCallback, type Dispatch } from "react";
import type { Vec2 } from "@sap-geometry/core";
import { clientToWorld } from "../lib/svgCoords";
import { snapPoint, snapToGrid, pointInPolygon, snapToMasses } from "../lib/snap";
import { GRID_STEP, SNAP_TOLERANCE, ORTHO_TOLERANCE_DEG, CLOSE_RADIUS } from "../lib/constants";
import type { MassDesign } from "../lib/types";
import type { StudioAction } from "../lib/reducer";

interface SvgCanvasProps {
  masses: MassDesign[];
  activeMassId: string | null;
  dispatch: Dispatch<StudioAction>;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INITIAL_VIEWBOX: ViewBox = { x: -5, y: -5, w: 30, h: 30 };
const ZOOM_FACTOR = 1.1;

function polygonArea(verts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    a += verts[i][0] * verts[j][1] - verts[j][0] * verts[i][1];
  }
  return Math.abs(a) / 2;
}

export function SvgCanvas({ masses, activeMassId, dispatch }: SvgCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(INITIAL_VIEWBOX);
  const [cursorPos, setCursorPos] = useState<Vec2 | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragMassId, setDragMassId] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const activeMass = masses.find((m) => m.id === activeMassId) ?? null;
  const isDrawing = activeMass !== null && !activeMass.closed;

  const lastVertex =
    isDrawing && activeMass.vertices.length > 0
      ? activeMass.vertices[activeMass.vertices.length - 1]
      : null;
  const firstVertex =
    isDrawing && activeMass.vertices.length >= 3
      ? activeMass.vertices[0]
      : null;

  // Check if cursor is near first vertex (close target)
  const isNearClose =
    isDrawing &&
    firstVertex &&
    cursorPos &&
    Math.hypot(cursorPos[0] - firstVertex[0], cursorPos[1] - firstVertex[1]) < CLOSE_RADIUS;

  // Scale-dependent sizes (in world units)
  const worldPerPx = viewBox.w / (svgRef.current?.clientWidth ?? 800);
  const vertexR = Math.max(0.1, worldPerPx * 4);
  const hoverR = Math.max(0.15, worldPerPx * 6);
  const hitRadius = Math.max(0.3, worldPerPx * 8);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      if (isPanning && panStart.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const pxDx = e.clientX - panStart.current.x;
        const pxDy = e.clientY - panStart.current.y;
        const worldDx = (pxDx / rect.width) * panStart.current.vb.w;
        const worldDy = (pxDy / rect.height) * panStart.current.vb.h;
        setViewBox({
          ...panStart.current.vb,
          x: panStart.current.vb.x - worldDx,
          y: panStart.current.vb.y - worldDy,
        });
        return;
      }

      const world = clientToWorld(e.clientX, e.clientY, svgRef.current);

      // Vertex dragging when closed
      if (dragIndex !== null && dragMassId !== null) {
        const snapped = snapToGrid(world, GRID_STEP);
        dispatch({ type: "MOVE_VERTEX", massId: dragMassId, index: dragIndex, pos: snapped });
        return;
      }

      // Vertex hover detection for active closed mass
      if (activeMass && activeMass.closed) {
        let nearest = -1;
        let nearestDist = hitRadius;
        for (let i = 0; i < activeMass.vertices.length; i++) {
          const d = Math.hypot(
            world[0] - activeMass.vertices[i][0],
            world[1] - activeMass.vertices[i][1],
          );
          if (d < nearestDist) {
            nearestDist = d;
            nearest = i;
          }
        }
        setHoverIndex(nearest >= 0 ? nearest : null);
        if (nearest >= 0) return;
      }

      // Drawing mode: snap cursor
      if (isDrawing) {
        let snapped = snapPoint(world, lastVertex, GRID_STEP, ORTHO_TOLERANCE_DEG);

        // Try snapping to other masses' vertices/edges
        const massSnap = snapToMasses(snapped, masses, activeMassId, SNAP_TOLERANCE);
        if (massSnap) {
          snapped = massSnap;
        }

        setCursorPos(snapped);
      }
    },
    [
      activeMass, activeMassId, isDrawing, lastVertex, isPanning,
      dragIndex, dragMassId, masses, hitRadius, dispatch,
    ],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0 || isPanning) return;

      // Drawing mode: add vertex or close
      if (isDrawing && cursorPos) {
        if (isNearClose && firstVertex) {
          dispatch({ type: "CLOSE_MASS" });
          return;
        }
        dispatch({ type: "ADD_VERTEX", vertex: cursorPos });
        return;
      }

      // Closed mode: check if clicking on an inactive mass to select it
      if (!svgRef.current) return;
      const world = clientToWorld(e.clientX, e.clientY, svgRef.current);

      // Find all closed masses containing the click, pick smallest area
      let bestMass: MassDesign | null = null;
      let bestArea = Infinity;
      for (const mass of masses) {
        if (!mass.closed || mass.vertices.length < 3) continue;
        if (mass.id === activeMassId) continue;
        if (pointInPolygon(world, mass.vertices)) {
          const area = polygonArea(mass.vertices);
          if (area < bestArea) {
            bestArea = area;
            bestMass = mass;
          }
        }
      }

      if (bestMass) {
        dispatch({ type: "SET_ACTIVE_MASS", id: bestMass.id });
      }
    },
    [isDrawing, cursorPos, isPanning, isNearClose, firstVertex, masses, activeMassId, dispatch],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      if (!svgRef.current) return;

      const world = clientToWorld(e.clientX, e.clientY, svgRef.current);
      const factor = e.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;

      setViewBox((vb) => {
        const newW = vb.w * factor;
        const newH = vb.h * factor;
        const svgCursorX = world[0];
        const svgCursorY = -world[1];
        const newX = svgCursorX - (svgCursorX - vb.x) * factor;
        const newY = svgCursorY - (svgCursorY - vb.y) * factor;
        return { x: newX, y: newY, w: newW, h: newH };
      });
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      // Middle button or right button for panning
      if (e.button === 1 || e.button === 2) {
        e.preventDefault();
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, vb: viewBox };
        return;
      }

      // Left click on hovered vertex starts drag (when active mass is closed)
      if (e.button === 0 && activeMass?.closed && hoverIndex !== null) {
        e.preventDefault();
        e.stopPropagation();
        setDragIndex(hoverIndex);
        setDragMassId(activeMassId);
      }
    },
    [viewBox, activeMass, activeMassId, hoverIndex],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button === 1 || e.button === 2) {
        setIsPanning(false);
        panStart.current = null;
      }
      if (e.button === 0 && dragIndex !== null) {
        setDragIndex(null);
        setDragMassId(null);
      }
    },
    [dragIndex],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // Generate grid lines
  const gridLines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  const step = GRID_STEP;
  const worldMinX = viewBox.x;
  const worldMaxX = viewBox.x + viewBox.w;
  const worldMinY = -(viewBox.y + viewBox.h);
  const worldMaxY = -viewBox.y;
  const gStart = Math.floor(worldMinX / step) * step;
  const gEnd = Math.ceil(worldMaxX / step) * step;
  const gStartY = Math.floor(worldMinY / step) * step;
  const gEndY = Math.ceil(worldMaxY / step) * step;

  for (let x = gStart; x <= gEnd; x += step) {
    gridLines.push({ x1: x, y1: worldMinY, x2: x, y2: worldMaxY, major: x % 5 === 0 });
  }
  for (let y = gStartY; y <= gEndY; y += step) {
    gridLines.push({ x1: worldMinX, y1: y, x2: worldMaxX, y2: y, major: y % 5 === 0 });
  }

  const strokeW = Math.max(0.02, worldPerPx * 1.5);
  const gridStrokeW = Math.max(0.01, worldPerPx * 0.5);

  // Cursor style
  let cursorStyle: string | undefined;
  if (activeMass?.closed) {
    if (dragIndex !== null) cursorStyle = "grabbing";
    else if (hoverIndex !== null) cursorStyle = "grab";
    else cursorStyle = "default";
  }

  return (
    <svg
      ref={svgRef}
      className="svg-canvas"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      onMouseMove={handleMouseMove}
      onClick={handleClick}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onContextMenu={handleContextMenu}
      style={cursorStyle ? { cursor: cursorStyle } : undefined}
    >
      <g transform="scale(1,-1)">
        {/* Grid */}
        {gridLines.map((g, i) => (
          <line
            key={i}
            x1={g.x1}
            y1={g.y1}
            x2={g.x2}
            y2={g.y2}
            className={g.major ? "svg-grid-line-major" : "svg-grid-line"}
            strokeWidth={gridStrokeW}
          />
        ))}

        {/* Render all masses */}
        {masses.map((mass) => {
          const isActive = mass.id === activeMassId;
          return renderMassPolygon(mass, isActive, {
            strokeW,
            vertexR,
            hoverR,
            worldPerPx,
            hoverIndex: isActive ? hoverIndex : null,
            dragIndex: isActive ? dragIndex : null,
          });
        })}

        {/* Drawing preview for active drawing mass */}
        {isDrawing && lastVertex && cursorPos && (
          <line
            className="svg-edge-preview"
            x1={lastVertex[0]}
            y1={lastVertex[1]}
            x2={isNearClose ? firstVertex![0] : cursorPos[0]}
            y2={isNearClose ? firstVertex![1] : cursorPos[1]}
            strokeWidth={strokeW}
          />
        )}

        {/* Close target highlight */}
        {isNearClose && firstVertex && (
          <circle
            className="svg-close-target"
            cx={firstVertex[0]}
            cy={firstVertex[1]}
            r={CLOSE_RADIUS}
            strokeWidth={strokeW}
          />
        )}

        {/* Ghost cursor dot */}
        {isDrawing && cursorPos && !isNearClose && (
          <circle
            className="svg-vertex-ghost"
            cx={cursorPos[0]}
            cy={cursorPos[1]}
            r={vertexR}
          />
        )}
      </g>
    </svg>
  );
}

// ── Helper: render a single mass polygon ────────

interface MassRenderOpts {
  strokeW: number;
  vertexR: number;
  hoverR: number;
  worldPerPx: number;
  hoverIndex: number | null;
  dragIndex: number | null;
}

function renderMassPolygon(
  mass: MassDesign,
  isActive: boolean,
  opts: MassRenderOpts,
) {
  const { vertices, closed } = mass;
  const { strokeW, vertexR, hoverR, worldPerPx, hoverIndex, dragIndex } = opts;

  if (vertices.length === 0) return null;

  const polygonClass = isActive ? "svg-polygon" : "svg-polygon-inactive";
  const edgeClass = isActive ? "svg-edge" : "svg-edge-inactive";

  return (
    <g key={mass.id}>
      {/* Filled polygon */}
      {closed && vertices.length >= 3 && (
        <polygon
          className={polygonClass}
          points={vertices.map((v) => `${v[0]},${v[1]}`).join(" ")}
          strokeWidth={strokeW}
        />
      )}

      {/* Edges */}
      {vertices.map((v, i) => {
        if (i === 0) return null;
        const prev = vertices[i - 1];
        return (
          <line
            key={`${mass.id}-edge-${i}`}
            className={edgeClass}
            x1={prev[0]}
            y1={prev[1]}
            x2={v[0]}
            y2={v[1]}
            strokeWidth={strokeW}
          />
        );
      })}

      {/* Closing edge */}
      {closed && vertices.length >= 3 && (
        <line
          className={edgeClass}
          x1={vertices[vertices.length - 1][0]}
          y1={vertices[vertices.length - 1][1]}
          x2={vertices[0][0]}
          y2={vertices[0][1]}
          strokeWidth={strokeW}
        />
      )}

      {/* Edge length labels (active mass only) */}
      {isActive &&
        vertices.map((v, i) => {
          if (i === 0) return null;
          const prev = vertices[i - 1];
          const len = Math.hypot(v[0] - prev[0], v[1] - prev[1]);
          const mx = (prev[0] + v[0]) / 2;
          const my = (prev[1] + v[1]) / 2;
          const dx = v[0] - prev[0];
          const dy = v[1] - prev[1];
          const nl = Math.hypot(dx, dy) || 1;
          const ox = (-dy / nl) * vertexR * 3;
          const oy = (dx / nl) * vertexR * 3;
          return (
            <text
              key={`${mass.id}-label-${i}`}
              className="svg-edge-label"
              x={mx + ox}
              y={my + oy}
              transform={`scale(1,-1) translate(0,${-2 * (my + oy)})`}
              style={{ fontSize: `${Math.max(0.3, worldPerPx * 10)}px` }}
            >
              {len.toFixed(1)}m
            </text>
          );
        })}

      {/* Closing edge label (active mass only) */}
      {isActive &&
        closed &&
        vertices.length >= 3 &&
        (() => {
          const a = vertices[vertices.length - 1];
          const b = vertices[0];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const nl = Math.hypot(dx, dy) || 1;
          const ox = (-dy / nl) * vertexR * 3;
          const oy = (dx / nl) * vertexR * 3;
          return (
            <text
              className="svg-edge-label"
              x={mx + ox}
              y={my + oy}
              transform={`scale(1,-1) translate(0,${-2 * (my + oy)})`}
              style={{ fontSize: `${Math.max(0.3, worldPerPx * 10)}px` }}
            >
              {len.toFixed(1)}m
            </text>
          );
        })()}

      {/* Vertex dots */}
      {vertices.map((v, i) => {
        if (isActive) {
          const isDragging = dragIndex === i;
          const isHovered = hoverIndex === i && !isDragging;
          const className = isDragging
            ? "svg-vertex-dragging"
            : isHovered
              ? "svg-vertex-hover"
              : "svg-vertex";
          const r = isDragging || isHovered ? hoverR : vertexR;
          return (
            <circle
              key={`${mass.id}-v-${i}`}
              className={className}
              cx={v[0]}
              cy={v[1]}
              r={r}
              strokeWidth={strokeW * 0.5}
              pointerEvents={closed ? "auto" : "none"}
            />
          );
        }
        // Inactive mass: small non-interactive dots
        return (
          <circle
            key={`${mass.id}-v-${i}`}
            className="svg-vertex-inactive"
            cx={v[0]}
            cy={v[1]}
            r={vertexR * 0.7}
            strokeWidth={strokeW * 0.5}
            pointerEvents="none"
          />
        );
      })}
    </g>
  );
}
