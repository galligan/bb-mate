import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pluginInspectionPlugin } from "./plugin-inspection-server";

const workspaceRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pluginInspectionPlugin({
      workspaceRoot,
      targetPath: process.env.BB_MATE_PLUGIN,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
