import { useState, useRef, useCallback } from "react";
import type { Vec2 } from "@sap-geometry/core";
import { clientToWorld } from "../lib/svgCoords";
import { snapPoint, snapToGrid } from "../lib/snap";
import { GRID_STEP, SNAP_TOLERANCE, ORTHO_TOLERANCE_DEG, CLOSE_RADIUS } from "../lib/constants";

interface SvgCanvasProps {
  vertices: Vec2[];
  onSetVertices: (v: Vec2[]) => void;
  closed: boolean;
  onClose: () => void;
  onVertexMove?: (index: number, pos: Vec2) => void;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const INITIAL_VIEWBOX: ViewBox = { x: -5, y: -5, w: 30, h: 30 };
const ZOOM_FACTOR = 1.1;

export function SvgCanvas({ vertices, onSetVertices, closed, onClose, onVertexMove }: SvgCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewBox, setViewBox] = useState<ViewBox>(INITIAL_VIEWBOX);
  const [cursorPos, setCursorPos] = useState<Vec2 | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; vb: ViewBox } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const lastVertex = vertices.length > 0 ? vertices[vertices.length - 1] : null;
  const firstVertex = vertices.length >= 3 ? vertices[0] : null;

  // Check if cursor is near first vertex (close target)
  const isNearClose =
    !closed &&
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
      if (closed && dragIndex !== null && onVertexMove) {
        const snapped = snapToGrid(world, GRID_STEP);
        onVertexMove(dragIndex, snapped);
        return;
      }

      // Vertex hover detection when closed
      if (closed) {
        let nearest = -1;
        let nearestDist = hitRadius;
        for (let i = 0; i < vertices.length; i++) {
          const d = Math.hypot(world[0] - vertices[i][0], world[1] - vertices[i][1]);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = i;
          }
        }
        setHoverIndex(nearest >= 0 ? nearest : null);
        return;
      }

      const snapped = snapPoint(world, lastVertex, GRID_STEP, ORTHO_TOLERANCE_DEG);
      setCursorPos(snapped);
    },
    [closed, lastVertex, isPanning, dragIndex, onVertexMove, vertices, hitRadius],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0 || closed || isPanning) return;
      if (!cursorPos) return;

      if (isNearClose && firstVertex) {
        onClose();
        return;
      }

      onSetVertices([...vertices, cursorPos]);
    },
    [closed, cursorPos, vertices, onSetVertices, isNearClose, firstVertex, onClose, isPanning],
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

      // Left click on hovered vertex starts drag (when closed)
      if (e.button === 0 && closed && hoverIndex !== null) {
        e.preventDefault();
        e.stopPropagation();
        setDragIndex(hoverIndex);
      }
    },
    [viewBox, closed, hoverIndex],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button === 1 || e.button === 2) {
        setIsPanning(false);
        panStart.current = null;
      }
      if (e.button === 0 && dragIndex !== null) {
        setDragIndex(null);
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
  if (closed) {
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

        {/* Closed polygon fill */}
        {closed && vertices.length >= 3 && (
          <polygon
            className="svg-polygon"
            points={vertices.map((v) => `${v[0]},${v[1]}`).join(" ")}
            strokeWidth={strokeW}
          />
        )}

        {/* Completed edges */}
        {vertices.map((v, i) => {
          if (i === 0) return null;
          const prev = vertices[i - 1];
          return (
            <line
              key={`edge-${i}`}
              className="svg-edge"
              x1={prev[0]}
              y1={prev[1]}
              x2={v[0]}
              y2={v[1]}
              strokeWidth={strokeW}
            />
          );
        })}

        {/* Closing edge when polygon is closed */}
        {closed && vertices.length >= 3 && (
          <line
            className="svg-edge"
            x1={vertices[vertices.length - 1][0]}
            y1={vertices[vertices.length - 1][1]}
            x2={vertices[0][0]}
            y2={vertices[0][1]}
            strokeWidth={strokeW}
          />
        )}

        {/* Edge length labels */}
        {vertices.map((v, i) => {
          if (i === 0) return null;
          const prev = vertices[i - 1];
          const len = Math.hypot(v[0] - prev[0], v[1] - prev[1]);
          const mx = (prev[0] + v[0]) / 2;
          const my = (prev[1] + v[1]) / 2;
          const dx = v[0] - prev[0];
          const dy = v[1] - prev[1];
          const nl = Math.hypot(dx, dy) || 1;
          const ox = -dy / nl * vertexR * 3;
          const oy = dx / nl * vertexR * 3;
          return (
            <text
              key={`label-${i}`}
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

        {/* Closing edge label */}
        {closed && vertices.length >= 3 && (() => {
          const a = vertices[vertices.length - 1];
          const b = vertices[0];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const nl = Math.hypot(dx, dy) || 1;
          const ox = -dy / nl * vertexR * 3;
          const oy = dx / nl * vertexR * 3;
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

        {/* Rubber-band line */}
        {!closed && lastVertex && cursorPos && (
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

        {/* Vertex dots */}
        {vertices.map((v, i) => {
          const isDragging = dragIndex === i;
          const isHovered = hoverIndex === i && !isDragging;
          const className = isDragging
            ? "svg-vertex-dragging"
            : isHovered
              ? "svg-vertex-hover"
              : "svg-vertex";
          const r = (isDragging || isHovered) ? hoverR : vertexR;
          return (
            <circle
              key={`vertex-${i}`}
              className={className}
              cx={v[0]}
              cy={v[1]}
              r={r}
              strokeWidth={strokeW * 0.5}
              pointerEvents={closed ? "auto" : "none"}
            />
          );
        })}

        {/* Ghost cursor dot */}
        {!closed && cursorPos && !isNearClose && (
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
