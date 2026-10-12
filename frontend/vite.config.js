import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@/components/...`, `@/pages/...` etc. instead of long relative paths.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    // Forward API calls to Flask, so the browser only ever talks to one origin (no CORS
    // needed). In Docker Compose API_URL is http://backend:8000.
    proxy: { "/api": process.env.API_URL || "http://127.0.0.1:8000" },
  },
});
