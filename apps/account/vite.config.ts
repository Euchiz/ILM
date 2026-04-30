import { defineConfig } from "vite";

const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  envDir: "../..",
  server: { port: 5178 },
});
