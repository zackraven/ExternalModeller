import { useMemo } from "react";
import type { BuildingSpec, FaceModel, Schedule } from "@sap-geometry/core";
import { resolve, solve } from "@sap-geometry/core";

interface UseModelResult {
  model: FaceModel | null;
  schedule: Schedule | null;
  error: string | null;
}

export function useModel(spec: BuildingSpec | null): UseModelResult {
  return useMemo(() => {
    if (!spec) return { model: null, schedule: null, error: null };
    try {
      const model = resolve(spec);
      const schedule = solve(spec);
      return { model, schedule, error: null };
    } catch (e) {
      return {
        model: null,
        schedule: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }, [spec]);
}
