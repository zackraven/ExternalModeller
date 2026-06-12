import { useState, useRef, useCallback, useMemo, type Dispatch } from "react";
import type { Vec2, RoofCut } from "@sap-geometry/core";
import { clientToWorld } from "../lib/svgCoords";
import { snapPoint, snapToGrid, pointInPolygon, snapToMasses, nearestPointOnSegment } from "../lib/snap";
import { GRID_STEP, SNAP_TOLERANCE, ORTHO_TOLERANCE_DEG, CLOSE_RADIUS } from "../lib/constants";
import { roofPlanLines } from "../lib/ridgeGraph";
import type { RidgeGraph, RidgeNode } from "../lib/ridgeGraph";
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
let _cutCounter = 0;

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

  // Ridge graph interaction state
  const [ridgeDragNodeId, setRidgeDragNodeId] = useState<string | null>(null);
  const [ridgeHoverNodeId, setRidgeHoverNodeId] = useState<string | null>(null);
  const [ridgeSelectedSegment, setRidgeSelectedSegment] = useState<{ from: string; to: string } | null>(null);

  // Cut interaction state
  const [selectedCutId, setSelectedCutId] = useState<string | null>(null);
  const [cutDrag, setCutDrag] = useState<
    | { mode: "endpoint"; cutId: string; endpoint: "a" | "b" }
    | { mode: "body"; cutId: string; origA: Vec2; origB: Vec2; origMouse: Vec2 }
    | null
  >(null);
  const [cutHover, setCutHover] = useState<
    | { type: "endpoint"; cutId: string; endpoint: "a" | "b" }
    | { type: "line"; cutId: string }
    | null
  >(null);
  const [addCutStart, setAddCutStart] = useState<Vec2 | null>(null);

  const activeMass = masses.find((m) => m.id === activeMassId) ?? null;
  const isDrawing = activeMass !== null && !activeMass.closed;
  const ridgeGraph = activeMass?.ridgeGraph ?? null;
  const isCutsMode = !!(activeMass?.closed && activeMass.roof.type === "cuts");
  const roofCuts = activeMass?.roofCuts ?? [];

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
  const ridgeNodeR = Math.max(0.15, worldPerPx * 6);
  const ridgeHoverR = Math.max(0.2, worldPerPx * 8);

  // Compute hip/valley projection lines for roof plan overlay
  const hipLines = useMemo(() => {
    if (!ridgeGraph || !activeMass?.closed || ridgeGraph.nodes.length === 0) return [];
    return roofPlanLines(ridgeGraph, activeMass.vertices);
  }, [ridgeGraph, activeMass]);

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

      // Ridge node dragging
      if (ridgeDragNodeId !== null && activeMassId) {
        const snapped = snapToGrid(world, GRID_STEP);
        dispatch({ type: "UPDATE_RIDGE_NODE", massId: activeMassId, nodeId: ridgeDragNodeId, pos: snapped });
        return;
      }

      // Cut endpoint/body dragging
      if (cutDrag !== null && activeMassId) {
        const snapped = snapToGrid(world, GRID_STEP);
        if (cutDrag.mode === "endpoint") {
          dispatch({
            type: "UPDATE_CUT",
            massId: activeMassId,
            cutId: cutDrag.cutId,
            patch: { [cutDrag.endpoint]: snapped as Vec2 },
          });
        } else {
          const dx = snapped[0] - snapToGrid(cutDrag.origMouse, GRID_STEP)[0];
          const dy = snapped[1] - snapToGrid(cutDrag.origMouse, GRID_STEP)[1];
          const newA: Vec2 = [cutDrag.origA[0] + dx, cutDrag.origA[1] + dy];
          const newB: Vec2 = [cutDrag.origB[0] + dx, cutDrag.origB[1] + dy];
          dispatch({
            type: "UPDATE_CUT",
            massId: activeMassId,
            cutId: cutDrag.cutId,
            patch: { a: newA, b: newB },
          });
        }
        return;
      }

      // Vertex dragging when closed
      if (dragIndex !== null && dragMassId !== null) {
        const snapped = snapToGrid(world, GRID_STEP);
        dispatch({ type: "MOVE_VERTEX", massId: dragMassId, index: dragIndex, pos: snapped });
        return;
      }

      // Ridge node hover detection (takes priority when ridge graph is active)
      if (ridgeGraph && ridgeGraph.nodes.length > 0) {
        let nearestNode: string | null = null;
        let nearestDist = hitRadius;
        for (const node of ridgeGraph.nodes) {
          const d = Math.hypot(world[0] - node.pos[0], world[1] - node.pos[1]);
          if (d < nearestDist) {
            nearestDist = d;
            nearestNode = node.id;
          }
        }
        setRidgeHoverNodeId(nearestNode);
        if (nearestNode) return;
      }

      // Cut hover detection (takes priority in cuts mode)
      if (isCutsMode && roofCuts.length > 0) {
        let bestHover: typeof cutHover = null;
        let bestDist = hitRadius;
        for (const cut of roofCuts) {
          // Check endpoints first (higher priority)
          for (const ep of ["a", "b"] as const) {
            const pt = cut[ep];
            const d = Math.hypot(world[0] - pt[0], world[1] - pt[1]);
            if (d < bestDist) {
              bestDist = d;
              bestHover = { type: "endpoint", cutId: cut.id, endpoint: ep };
            }
          }
        }
        if (!bestHover) {
          // Check line bodies
          bestDist = hitRadius;
          for (const cut of roofCuts) {
            const nearest = nearestPointOnSegment(world, cut.a, cut.b);
            const d = Math.hypot(world[0] - nearest[0], world[1] - nearest[1]);
            if (d < bestDist) {
              bestDist = d;
              bestHover = { type: "line", cutId: cut.id };
            }
          }
        }
        setCutHover(bestHover);
        if (bestHover) {
          // Update cursor for add-cut mode
          if (addCutStart) setCursorPos(snapToGrid(world, GRID_STEP));
          return;
        }
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

      // Cuts mode: track cursor for add-cut preview
      if (isCutsMode && addCutStart) {
        setCursorPos(snapToGrid(world, GRID_STEP));
      }
    },
    [
      activeMass, activeMassId, isDrawing, lastVertex, isPanning,
      dragIndex, dragMassId, ridgeDragNodeId, ridgeGraph,
      masses, hitRadius, dispatch, isCutsMode, cutDrag, addCutStart, roofCuts,
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

      if (!svgRef.current) return;
      const world = clientToWorld(e.clientX, e.clientY, svgRef.current);

      // Cuts mode: select cut or add cut via two-click flow
      if (isCutsMode && activeMassId) {
        const snapped = snapToGrid(world, GRID_STEP);

        // If hovering a cut line/endpoint, select it
        if (cutHover) {
          setSelectedCutId(cutHover.cutId);
          setAddCutStart(null);
          return;
        }

        // Two-click add cut flow
        if (addCutStart) {
          // Second click: complete the cut
          const a = addCutStart;
          const b = snapped;
          // Determine side: roof should rise toward footprint centroid
          const verts = activeMass!.vertices;
          const cx = verts.reduce((s, v) => s + v[0], 0) / verts.length;
          const cy = verts.reduce((s, v) => s + v[1], 0) / verts.length;
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const len = Math.hypot(dx, dy);
          if (len < 1e-6) { setAddCutStart(null); return; }
          // Left side inward: (-dy, dx) / len
          const inwardX = -dy / len;
          const inwardY = dx / len;
          const midX = (a[0] + b[0]) / 2;
          const midY = (a[1] + b[1]) / 2;
          const dotC = (cx - midX) * inwardX + (cy - midY) * inwardY;
          const side: "left" | "right" = dotC >= 0 ? "left" : "right";
          _cutCounter++;
          const cut: RoofCut = { id: `cut_${_cutCounter}`, a, b, side, pitch: 35 };
          dispatch({ type: "ADD_CUT", massId: activeMassId, cut });
          setSelectedCutId(cut.id);
          setAddCutStart(null);
          setCursorPos(null);
          return;
        }

        // First click: start add cut
        setAddCutStart(snapped);
        setCursorPos(null);
        setSelectedCutId(null);
        return;
      }

      // Closed mode: check if clicking on an inactive mass to select it
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
        return;
      }

      // No masses at all → auto-create a drawing mass and place first vertex
      if (masses.length === 0) {
        const snapped = snapToGrid(world, GRID_STEP);
        dispatch({ type: "ADD_MASS" });
        dispatch({ type: "ADD_VERTEX", vertex: snapped });
      }
    },
    [isDrawing, cursorPos, isPanning, isNearClose, firstVertex, masses, activeMassId,
     dispatch, isCutsMode, cutHover, addCutStart, activeMass],
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

      // Left click on hovered cut endpoint/line starts cut drag
      if (e.button === 0 && isCutsMode && cutHover && !addCutStart) {
        e.preventDefault();
        e.stopPropagation();
        if (cutHover.type === "endpoint") {
          setCutDrag({ mode: "endpoint", cutId: cutHover.cutId, endpoint: cutHover.endpoint });
        } else {
          // Body drag: find the cut and record starting positions
          const cut = roofCuts.find((c) => c.id === cutHover.cutId);
          if (cut && svgRef.current) {
            const w = clientToWorld(e.clientX, e.clientY, svgRef.current);
            setCutDrag({ mode: "body", cutId: cut.id, origA: cut.a, origB: cut.b, origMouse: w });
          }
        }
        return;
      }

      // Left click on hovered ridge node starts ridge drag
      if (e.button === 0 && ridgeHoverNodeId !== null) {
        e.preventDefault();
        e.stopPropagation();
        setRidgeDragNodeId(ridgeHoverNodeId);
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
    [viewBox, activeMass, activeMassId, hoverIndex, ridgeHoverNodeId,
     isCutsMode, cutHover, addCutStart, roofCuts],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button === 1 || e.button === 2) {
        setIsPanning(false);
        panStart.current = null;
      }
      if (e.button === 0 && cutDrag !== null) {
        setCutDrag(null);
      }
      if (e.button === 0 && ridgeDragNodeId !== null) {
        setRidgeDragNodeId(null);
      }
      if (e.button === 0 && dragIndex !== null) {
        setDragIndex(null);
        setDragMassId(null);
      }
    },
    [dragIndex, ridgeDragNodeId, cutDrag],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (addCutStart) { setAddCutStart(null); setCursorPos(null); }
        if (selectedCutId) setSelectedCutId(null);
        return;
      }
      if (e.key === "Delete" && isCutsMode && selectedCutId && activeMassId) {
        dispatch({ type: "DELETE_CUT", massId: activeMassId, cutId: selectedCutId });
        setSelectedCutId(null);
        return;
      }
      if (e.key === "Delete" && ridgeSelectedSegment && activeMassId) {
        dispatch({
          type: "REMOVE_RIDGE_SEGMENT",
          massId: activeMassId,
          from: ridgeSelectedSegment.from,
          to: ridgeSelectedSegment.to,
        });
        setRidgeSelectedSegment(null);
      }
    },
    [ridgeSelectedSegment, activeMassId, dispatch, addCutStart, selectedCutId, isCutsMode],
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
  if (cutDrag !== null) cursorStyle = "grabbing";
  else if (cutHover?.type === "endpoint") cursorStyle = "grab";
  else if (cutHover?.type === "line") cursorStyle = "move";
  else if (isCutsMode && addCutStart) cursorStyle = "crosshair";
  else if (isCutsMode) cursorStyle = "crosshair";
  else if (ridgeDragNodeId !== null) cursorStyle = "grabbing";
  else if (ridgeHoverNodeId !== null) cursorStyle = "grab";
  else if (activeMass?.closed) {
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
      onKeyDown={handleKeyDown}
      tabIndex={0}
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
            showOpenings: isActive,
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

        {/* ── Cuts overlay ── */}
        {isCutsMode && roofCuts.length > 0 && (
          <g className="svg-cuts-overlay">
            {roofCuts.map((cut) => {
              const isSelected = selectedCutId === cut.id;
              const isDragging = cutDrag?.cutId === cut.id;
              const isLineHovered = cutHover?.type === "line" && cutHover.cutId === cut.id;

              // Perpendicular tick on rising side
              const dx = cut.b[0] - cut.a[0];
              const dy = cut.b[1] - cut.a[1];
              const len = Math.hypot(dx, dy);
              const tickLen = Math.max(0.3, worldPerPx * 12);
              let tickLine = null;
              if (len > 1e-6) {
                const ux = dx / len;
                const uy = dy / len;
                // Inward direction depends on side
                const ix = cut.side === "left" ? -uy : uy;
                const iy = cut.side === "left" ? ux : -ux;
                const mx = (cut.a[0] + cut.b[0]) / 2;
                const my = (cut.a[1] + cut.b[1]) / 2;
                tickLine = (
                  <line
                    x1={mx}
                    y1={my}
                    x2={mx + ix * tickLen}
                    y2={my + iy * tickLen}
                    stroke={isSelected ? "#ff6b81" : "#9b59b6"}
                    strokeWidth={strokeW * 1.5}
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                );
              }

              return (
                <g key={`cut-${cut.id}`}>
                  {/* Eaves line */}
                  <line
                    x1={cut.a[0]}
                    y1={cut.a[1]}
                    x2={cut.b[0]}
                    y2={cut.b[1]}
                    stroke={isSelected ? "#ff6b81" : "#9b59b6"}
                    strokeWidth={strokeW * (isSelected || isLineHovered ? 3 : 2)}
                    strokeLinecap="round"
                    style={{ cursor: "pointer" }}
                    pointerEvents="stroke"
                  />
                  {tickLine}
                  {/* Endpoint A */}
                  <circle
                    cx={cut.a[0]}
                    cy={cut.a[1]}
                    r={
                      (cutHover?.type === "endpoint" && cutHover.cutId === cut.id && cutHover.endpoint === "a") || isDragging
                        ? hoverR
                        : vertexR
                    }
                    fill={isSelected ? "#ff6b81" : "#9b59b6"}
                    stroke="#fff"
                    strokeWidth={strokeW * 0.5}
                    style={{ cursor: "grab" }}
                    pointerEvents="auto"
                  />
                  {/* Endpoint B */}
                  <circle
                    cx={cut.b[0]}
                    cy={cut.b[1]}
                    r={
                      (cutHover?.type === "endpoint" && cutHover.cutId === cut.id && cutHover.endpoint === "b") || isDragging
                        ? hoverR
                        : vertexR
                    }
                    fill={isSelected ? "#ff6b81" : "#9b59b6"}
                    stroke="#fff"
                    strokeWidth={strokeW * 0.5}
                    style={{ cursor: "grab" }}
                    pointerEvents="auto"
                  />
                  {/* Pitch label */}
                  {len > 1e-6 && (
                    <text
                      x={(cut.a[0] + cut.b[0]) / 2}
                      y={(cut.a[1] + cut.b[1]) / 2}
                      transform={`scale(1,-1) translate(0,${-2 * (cut.a[1] + cut.b[1]) / 2})`}
                      fill={isSelected ? "#ff6b81" : "#9b59b6"}
                      opacity={0.9}
                      style={{ fontSize: `${Math.max(0.3, worldPerPx * 10)}px` }}
                      dominantBaseline="central"
                      textAnchor="middle"
                      dy={`${-worldPerPx * 12}px`}
                      pointerEvents="none"
                    >
                      {cut.pitch}°{cut.eavesZ !== undefined ? ` z=${cut.eavesZ.toFixed(1)}` : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}

        {/* Add-cut preview line */}
        {isCutsMode && addCutStart && cursorPos && (
          <line
            x1={addCutStart[0]}
            y1={addCutStart[1]}
            x2={cursorPos[0]}
            y2={cursorPos[1]}
            stroke="#9b59b6"
            strokeWidth={strokeW * 1.5}
            strokeDasharray={`${worldPerPx * 4} ${worldPerPx * 3}`}
            pointerEvents="none"
          />
        )}

        {/* Add-cut first point indicator */}
        {isCutsMode && addCutStart && (
          <circle
            cx={addCutStart[0]}
            cy={addCutStart[1]}
            r={vertexR}
            fill="#9b59b6"
            stroke="#fff"
            strokeWidth={strokeW * 0.5}
            pointerEvents="none"
          />
        )}

        {/* ── Ridge graph overlay ── */}
        {ridgeGraph && ridgeGraph.nodes.length > 0 && (
          <g className="svg-ridge-overlay">
            {/* Hip/valley projection lines (footprint corners → ridge) */}
            {hipLines.map((line, i) => (
              <line
                key={`hip-${i}`}
                x1={line.from[0]}
                y1={line.from[1]}
                x2={line.to[0]}
                y2={line.to[1]}
                stroke="#8899aa"
                strokeWidth={strokeW * 0.8}
                strokeDasharray={`${worldPerPx * 3} ${worldPerPx * 2}`}
                opacity={0.5}
                pointerEvents="none"
              />
            ))}

            {/* Ridge segments */}
            {ridgeGraph.segments.map((seg, si) => {
              const fromNode = ridgeGraph.nodes.find(n => n.id === seg.from);
              const toNode = ridgeGraph.nodes.find(n => n.id === seg.to);
              if (!fromNode || !toNode) return null;
              const isSelected =
                ridgeSelectedSegment &&
                ((ridgeSelectedSegment.from === seg.from && ridgeSelectedSegment.to === seg.to) ||
                 (ridgeSelectedSegment.from === seg.to && ridgeSelectedSegment.to === seg.from));
              return (
                <line
                  key={`rs-${si}`}
                  x1={fromNode.pos[0]}
                  y1={fromNode.pos[1]}
                  x2={toNode.pos[0]}
                  y2={toNode.pos[1]}
                  stroke={isSelected ? "#ff6b81" : "#ffd700"}
                  strokeWidth={strokeW * 2.5}
                  strokeLinecap="round"
                  style={{ cursor: "pointer" }}
                  pointerEvents="stroke"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRidgeSelectedSegment(
                      isSelected ? null : { from: seg.from, to: seg.to },
                    );
                  }}
                />
              );
            })}

            {/* Ridge nodes */}
            {ridgeGraph.nodes.map((node) => {
              const isDragging = ridgeDragNodeId === node.id;
              const isHovered = ridgeHoverNodeId === node.id && !isDragging;
              const r = isDragging || isHovered ? ridgeHoverR : ridgeNodeR;
              return (
                <g key={`rn-${node.id}`}>
                  <circle
                    cx={node.pos[0]}
                    cy={node.pos[1]}
                    r={r}
                    fill={isDragging ? "#ff6b81" : "#ffd700"}
                    stroke="#fff"
                    strokeWidth={strokeW * 0.5}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}
                    pointerEvents="auto"
                  />
                  <text
                    x={node.pos[0] + ridgeHoverR * 1.8}
                    y={node.pos[1]}
                    transform={`scale(1,-1) translate(0,${-2 * node.pos[1]})`}
                    fill="#ffd700"
                    opacity={0.8}
                    style={{ fontSize: `${Math.max(0.3, worldPerPx * 10)}px` }}
                    dominantBaseline="central"
                    pointerEvents="none"
                  >
                    z={node.z.toFixed(1)}
                  </text>
                </g>
              );
            })}
          </g>
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
  showOpenings: boolean;
}

function renderMassPolygon(
  mass: MassDesign,
  isActive: boolean,
  opts: MassRenderOpts,
) {
  const { vertices, closed } = mass;
  const { strokeW, vertexR, hoverR, worldPerPx, hoverIndex, dragIndex, showOpenings } = opts;

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

      {/* Opening tick marks */}
      {showOpenings &&
        closed &&
        mass.openings?.map((opening, oi) => {
          const ei = opening.edge;
          if (ei < 0 || ei >= vertices.length) return null;
          const va = vertices[ei];
          const vb = vertices[(ei + 1) % vertices.length];
          const edgeDx = vb[0] - va[0];
          const edgeDy = vb[1] - va[1];
          const edgeLen = Math.hypot(edgeDx, edgeDy);
          if (edgeLen < 1e-6) return null;

          // Unit vectors along edge and outward normal
          const ux = edgeDx / edgeLen;
          const uy = edgeDy / edgeLen;
          // Outward normal (for CCW winding, right-hand rule: rotate edge dir -90°)
          const nx = uy;
          const ny = -ux;
          const offset = vertexR * 2;

          const n = opening.count ?? 1;
          const cellLen = edgeLen / n;
          const halfW = opening.width / 2;

          const ticks: { x1: number; y1: number; x2: number; y2: number }[] = [];
          for (let k = 0; k < n; k++) {
            const centerT = (k + 0.5) * cellLen;
            const cx = va[0] + ux * centerT + nx * offset;
            const cy = va[1] + uy * centerT + ny * offset;
            ticks.push({
              x1: cx - ux * halfW,
              y1: cy - uy * halfW,
              x2: cx + ux * halfW,
              y2: cy + uy * halfW,
            });
          }

          return ticks.map((t, ti) => (
            <line
              key={`${mass.id}-otick-${oi}-${ti}`}
              className="svg-opening-tick"
              x1={t.x1}
              y1={t.y1}
              x2={t.x2}
              y2={t.y2}
              strokeWidth={strokeW * 1.5}
            />
          ));
        })}
    </g>
  );
}
