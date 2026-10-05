import { defineConfig } from "vite";
export default defineConfig({
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
