import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@sap-geometry/core": path.resolve(__dirname, "../core/src/index.ts"),
    },
  },
});
