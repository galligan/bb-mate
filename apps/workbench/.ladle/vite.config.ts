import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  define: {
    "import.meta.env.VITE_LADLE_APP_ID": JSON.stringify(
      "bb-mate-surface-lab-v1",
    ),
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  cacheDir: "node_modules/.vite/ladle",
});
