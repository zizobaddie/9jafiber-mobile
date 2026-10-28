import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// The engineer screens come from the admin repo (src/field, see scripts/sync-field.sh);
// their admin-only imports point at small shims here.
export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: [
      { find: "next/navigation", replacement: path.resolve(__dirname, "src/shims/navigation.ts") },
      { find: "@/libs/http/axios.http", replacement: path.resolve(__dirname, "src/shims/axios.http.ts") },
      { find: "@/libs/utils/token.util", replacement: path.resolve(__dirname, "src/shims/token.ts") },
      { find: "@/libs/utils/env.util", replacement: path.resolve(__dirname, "src/shims/env.ts") },
      { find: "@/components/Field", replacement: path.resolve(__dirname, "src/field") },
    ],
  },
  build: { outDir: "dist", emptyOutDir: true },
});
