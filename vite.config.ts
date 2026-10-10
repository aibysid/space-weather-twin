import { defineConfig } from "vite";
export default defineConfig({
  base: "/space-weather-twin/",
  build: { chunkSizeWarningLimit: 800 },
});
