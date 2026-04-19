import { resolve } from "node:path";
import { defineConfig } from "vite";

const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        protocolManager: resolve(__dirname, "protocol-manager/index.html")
      }
    }
  },
  server: { port: 5173 }
});
