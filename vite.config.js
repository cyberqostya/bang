import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [vue()],
  server: {
    proxy: {
      "/game-ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
});
