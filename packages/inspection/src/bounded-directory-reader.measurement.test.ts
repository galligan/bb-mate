import { expect, test } from "bun:test";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

test("bounds a reproducible 100k-entry directory in a fresh process", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "bb-plugin-studio-directory-measurement-"),
  );
  for (let offset = 0; offset < 100_000; offset += 500) {
    await Promise.all(
      Array.from({ length: 500 }, (_, index) =>
        fs.writeFile(
          path.join(root, `entry-${String(offset + index).padStart(6, "0")}`),
          "",
        ),
      ),
    );
  }

  try {
    const child = Bun.spawnSync({
      cmd: [
        process.execPath,
        "run",
        path.join(import.meta.dir, "bounded-directory-reader.measurement.ts"),
        root,
        "--remove-after",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(child.exitCode).toBe(0);
    const measurement = JSON.parse(child.stdout.toString()) as {
      elapsedMs: number;
      maxRssBytes: number;
      limited: boolean;
      entryCount: number;
      nameBytes: number;
      work: number;
    };

    expect(measurement).toMatchObject({
      limited: true,
      entryCount: 1_535,
      nameBytes: 18_420,
      work: 16_384,
    });
    expect(measurement.elapsedMs).toBeLessThan(5_000);
    expect(measurement.maxRssBytes).toBeLessThan(256 * 1_024 * 1_024);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 120_000);
