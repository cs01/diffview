import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { diffviewPlugin } from "./server/plugin.ts";

export default defineConfig({
  plugins: [react(), diffviewPlugin()],
  build: { chunkSizeWarningLimit: 1000 },
  // The watched repos can be huge; Vite must not crawl them itself.
  server: { watch: { ignored: ["**/node_modules/**", "**/dist/**"] } },
});
