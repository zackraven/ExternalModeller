export interface WallFaceRef {
  massId: string;
  storey: number;
  edge: number;
}

const WALL_RE = /^(.+)_wall_s(\d+)_e(\d+)$/;

export function parseWallFaceId(id: string): WallFaceRef | null {
  const m = WALL_RE.exec(id);
  if (!m) return null;
  return { massId: m[1], storey: Number(m[2]), edge: Number(m[3]) };
}
