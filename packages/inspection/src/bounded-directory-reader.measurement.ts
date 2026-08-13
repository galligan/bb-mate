import { readBoundedDirectoryEntries } from "./bounded-directory-reader.ts";
import { promises as fs } from "node:fs";

const directory = process.argv[2];
if (!directory) throw new TypeError("measurement directory is required");

const started = performance.now();
const result = await readBoundedDirectoryEntries(directory);
const elapsedMs = performance.now() - started;
const maxRss = process.resourceUsage().maxRSS;

process.stdout.write(
  `${JSON.stringify({
    elapsedMs,
    maxRssBytes: process.platform === "darwin" ? maxRss : maxRss * 1_024,
    limited: result.limited,
    entryCount: result.entryCount,
    nameBytes: result.nameBytes,
    work: result.work,
  })}\n`,
);

if (process.argv.includes("--remove-after"))
  await fs.rm(directory, { recursive: true, force: true });
