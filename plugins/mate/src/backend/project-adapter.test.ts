import { describe, expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  deriveRuntimeDataRoot,
  listProjectOptions,
  resolveProjectSource,
} from "./project-adapter.ts";

const source = (overrides: Record<string, unknown> = {}) => ({
  id: "source-1",
  projectId: "project-1",
  isDefault: false,
  createdAt: 1,
  updatedAt: 2,
  type: "local_path" as const,
  hostId: "host-1",
  path: "/Users/test/project",
  ...overrides,
});

const project = (overrides: Record<string, unknown> = {}) => ({
  id: "project-1",
  kind: "standard" as const,
  name: "Example",
  gitRemoteUrl: null,
  createdAt: 1,
  updatedAt: 2,
  sources: [source()],
  ...overrides,
});

function sdk(projects = [project()], primaryHostId: string | null = "host-1") {
  return {
    system: { config: async () => ({ primaryHostId, dataDir: "/bb-data" }) },
    projects: {
      list: async () => projects,
      get: async ({ projectId }: { projectId: string }) => {
        const found = projects.find(({ id }) => id === projectId);
        if (!found) throw new Error("private upstream detail");
        return found;
      },
    },
  };
}

describe("released bb project adapter", () => {
  test("admits exactly one same-project source on the primary host without requiring default", async () => {
    const api = sdk();
    expect(await listProjectOptions(api)).toEqual({
      state: "ready",
      items: [{ id: "project-1", label: "Example", admission: "available" }],
    });
    expect(await resolveProjectSource(api, "project-1")).toMatchObject({
      projectId: "project-1",
      sourceId: "source-1",
      path: "/Users/test/project",
    });
  });

  test("fails closed for zero, foreign-project, foreign-host, or multiple matching sources", async () => {
    const variants = [
      [],
      [source({ projectId: "other" })],
      [source({ hostId: "host-2" })],
      [source(), source({ id: "source-2" })],
      [source({ path: "../relative" })],
      [source({ type: "remote_clone" })],
    ];
    for (const sources of variants) {
      const api = sdk([project({ sources })]);
      expect(await listProjectOptions(api)).toEqual({
        state: "ready",
        items: [],
      });
      await expect(resolveProjectSource(api, "project-1")).rejects.toThrow(
        "Project source unavailable",
      );
    }
  });

  test("sorts and bounds the path-free project projection", async () => {
    const api = sdk([
      project({ id: "project-b", name: "Zulu", sources: [] }),
      project({ id: "project-a", name: "Alpha", sources: [] }),
      project({ id: "../private", name: "Leaky", sources: [] }),
      project({ id: "project-path", name: "folder/project", sources: [] }),
    ]);
    expect(await listProjectOptions(api)).toEqual({
      state: "ready",
      items: [],
    });
  });

  test("omits 128 ineligible projects without crowding out an eligible Zulu project", async () => {
    const ineligible = Array.from({ length: 128 }, (_, index) =>
      project({
        id: `project-${String(index).padStart(3, "0")}`,
        name: `Alpha ${String(index).padStart(3, "0")}`,
        sources: [],
      }),
    );
    const eligible = project({
      id: "project-zulu",
      name: "Zulu",
      sources: [
        source({
          id: "source-zulu",
          projectId: "project-zulu",
          path: "/Users/test/zulu",
        }),
      ],
    });
    const result = await listProjectOptions(sdk([...ineligible, eligible]));
    expect(result).toEqual({
      state: "ready",
      items: [{ id: "project-zulu", label: "Zulu", admission: "available" }],
    });
  });

  test("sorts and bounds eligible projects at the exact 128-item boundary", async () => {
    const projects = Array.from({ length: 129 }, (_, index) =>
      project({
        id: `project-${String(index).padStart(3, "0")}`,
        name: `Project ${String(index).padStart(3, "0")}`,
        sources: [
          source({
            id: `source-${index}`,
            projectId: `project-${String(index).padStart(3, "0")}`,
            path: `/Users/test/project-${index}`,
          }),
        ],
      }),
    );
    const result = await listProjectOptions(sdk(projects));
    expect(result.items).toHaveLength(128);
    expect(result.items[0]?.id).toBe("project-000");
    expect(result.items.at(-1)?.id).toBe("project-127");
    expect(result.items.some(({ id }) => id === "project-128")).toBe(false);
    expect(new Set(result.items.map(({ id }) => id)).size).toBe(128);
  });

  test("derives only the fixed runtime leaf from a canonical bb data directory", async () => {
    const parent = await fs.mkdtemp(
      path.join(os.tmpdir(), "mate-project-adapter-"),
    );
    const dataDir = path.join(parent, "bb-data");
    await fs.mkdir(dataDir);
    expect(await deriveRuntimeDataRoot(dataDir)).toBe(
      path.join(await fs.realpath(dataDir), "plugins/mate/runtime"),
    );
    for (const value of ["", ".", "/", "/tmp/../private", "/tmp/", "/tmp\0x"])
      await expect(deriveRuntimeDataRoot(value)).rejects.toThrow(
        "Runtime data directory unavailable",
      );
    const alias = path.join(parent, "alias");
    await fs.symlink(dataDir, alias);
    await expect(deriveRuntimeDataRoot(alias)).resolves.toBe(
      path.join(await fs.realpath(dataDir), "plugins/mate/runtime"),
    );
    const unsafeDataDir = path.join(parent, "unsafe-data");
    const outside = path.join(parent, "outside");
    await fs.mkdir(unsafeDataDir);
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(unsafeDataDir, "plugins"));
    await expect(deriveRuntimeDataRoot(unsafeDataDir)).rejects.toThrow(
      "Runtime data directory unavailable",
    );
    await fs.rm(parent, { recursive: true, force: true });
  });
});
