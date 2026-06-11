import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@sap-geometry/core": path.resolve(__dirname, "../core/src/index.ts"),
      "@sap-geometry/viewer": path.resolve(__dirname, "../viewer/src"),
    },
  },
  server: {
    port: 5174,
  },
});
