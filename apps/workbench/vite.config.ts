import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pluginInspectionPlugin } from "./plugin-inspection-server";

const sourceRoot = path.resolve(__dirname, "../..");
const workspaceRoot = process.env.BB_MATE_WORKSPACE ?? sourceRoot;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pluginInspectionPlugin({
      workspaceRoot,
      commandWorkspaceRoot: sourceRoot,
      targetPath: process.env.BB_MATE_PLUGIN,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
