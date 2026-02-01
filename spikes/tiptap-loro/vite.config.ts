import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],
  server: {
    port: 5174,
  },
  // loro-crdt uses WASM and top-level await
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    // Exclude loro-crdt from pre-bundling (it has WASM)
    exclude: ["loro-crdt"],
  },
});
