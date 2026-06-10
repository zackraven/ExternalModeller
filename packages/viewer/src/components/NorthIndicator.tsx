import { useMemo } from "react";
import * as THREE from "three";

interface NorthIndicatorProps {
  northAngle: number; // degrees
}

export function NorthIndicator({ northAngle }: NorthIndicatorProps) {
  const rotation = useMemo(
    () => -(northAngle * Math.PI) / 180,
    [northAngle],
  );

  // Arrow pointing in +Y (north) direction, rotated around Z by northAngle
  return (
    <group rotation={[0, 0, rotation]} position={[0, 0, 0.01]}>
      {/* Shaft */}
      <mesh position={[0, 3.5, 0]}>
        <boxGeometry args={[0.1, 7, 0.1]} />
        <meshStandardMaterial color="#e94560" />
      </mesh>
      {/* Arrowhead */}
      <mesh position={[0, 7.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.3, 0.8, 8]} />
        <meshStandardMaterial color="#e94560" />
      </mesh>
      {/* "N" label */}
      <sprite position={[0, 8.5, 0]} scale={[1, 1, 1]}>
        <spriteMaterial map={useNTexture()} />
      </sprite>
    </group>
  );
}

function useNTexture(): THREE.Texture {
  return useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e94560";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 32, 32);
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);
}
