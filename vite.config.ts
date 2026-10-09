import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  // Keep the JSX runtime explicit for dev transforms as well as builds.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  // Reload explicitly: hot reload would destroy the running VM and model.
  server: {
    hmr: false,
  },
  worker: { format: "es" },
  build: { target: "es2022" },
});
