import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { buildIntegrity } from "./build-integrity.js";

export default defineConfig({
  plugins: [react(), buildIntegrity()],
  build: { assetsInlineLimit: 100000 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.js"
  }
});
