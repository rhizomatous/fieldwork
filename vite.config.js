import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Keep the JSX runtime explicit for dev transforms as well as builds.
  esbuild: { jsx: "automatic", jsxImportSource: "react" },
  // Reload explicitly: hot reload would destroy the running VM and model.
  server: {
    hmr: false,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  worker: { format: "es" },
  build: { target: "es2022" },
});
