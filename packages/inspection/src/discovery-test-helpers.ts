import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const EXAMPLE_ROOT_KEY = "e".repeat(32);
export const WORKSPACE_ROOT_KEY = "w".repeat(32);

export function createDiscoveryTestHarness(): {
  createRoot(name?: string): Promise<string>;
  writePlugin(root: string, name: string): Promise<void>;
  cleanup(): Promise<void>;
} {
  const temporaryRoots: string[] = [];
  return {
    async createRoot(name = "workspace") {
      const parent = await fs.mkdtemp(
        path.join(os.tmpdir(), "bb-plugin-studio-discovery-"),
      );
      temporaryRoots.push(parent);
      const root = path.join(parent, name);
      await fs.mkdir(root);
      return root;
    },
    async writePlugin(root, name) {
      await fs.writeFile(
        path.join(root, "package.json"),
        `${JSON.stringify({
          name: `bb-plugin-${name}`,
          version: "1.2.3",
          bb: {
            name,
            description: `${name} plugin`,
            branding: { icon: "Puzzle" },
            server: "./server.ts",
          },
        })}\n`,
      );
      await fs.writeFile(path.join(root, "server.ts"), "export {};\n");
    },
    async cleanup() {
      await Promise.all(
        temporaryRoots
          .splice(0)
          .map((root) => fs.rm(root, { recursive: true, force: true })),
      );
    },
  };
}
