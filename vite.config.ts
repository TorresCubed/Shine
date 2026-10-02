import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { hostname } from "node:os";

// Two pages: the game, and the level editor (editor.html). Reachable on the local network by this
// computer's name as well as its IP (npm run host / share).
const allowedHosts = [hostname(), hostname().toLowerCase()];
export default defineConfig({
  plugins: [preact()],
  server: { allowedHosts },
  preview: { allowedHosts },
  build: {
    rollupOptions: {
      input: { game: "index.html", editor: "editor.html" },
    },
  },
});
