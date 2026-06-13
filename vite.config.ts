import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: ".",
  build: {
    outDir: "dist-web",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/openapi.json": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["web/src/test-setup.ts"],
    include: ["web/src/**/*.test.ts", "web/src/**/*.test.tsx"],
  },
});
