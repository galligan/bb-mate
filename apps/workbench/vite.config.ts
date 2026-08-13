import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { pluginInspectionPlugin } from "./plugin-inspection-server";

const sourceRoot = path.resolve(__dirname, "../..");
const workspaceRoot = process.env.BB_PLUGIN_STUDIO_WORKSPACE ?? sourceRoot;
const dataRoot =
  process.env.BB_PLUGIN_STUDIO_DATA_DIR ??
  path.join(sourceRoot, "node_modules", ".bb-plugin-studio-workbench");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pluginInspectionPlugin({
      dataRoot,
      workspaceRoot,
      targetPath: process.env.BB_PLUGIN_STUDIO_PLUGIN,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
