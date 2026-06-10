interface ToolbarProps {
  showOverlay: boolean;
  showNorth: boolean;
  onToggleOverlay: () => void;
  onToggleNorth: () => void;
  onResetView: () => void;
  onLoadNew: () => void;
}

export function Toolbar({
  showOverlay,
  showNorth,
  onToggleOverlay,
  onToggleNorth,
  onResetView,
  onLoadNew,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <button
        className={showOverlay ? "active" : ""}
        onClick={onToggleOverlay}
      >
        Labels
      </button>
      <button
        className={showNorth ? "active" : ""}
        onClick={onToggleNorth}
      >
        North
      </button>
      <button onClick={onResetView}>Reset view</button>
      <button onClick={onLoadNew}>Load new</button>
    </div>
  );
}
