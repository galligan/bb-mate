import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const cliRoot = path.join(repositoryRoot, "apps", "cli");
const cliDist = path.join(cliRoot, "dist");
const workbenchRoot = path.join(repositoryRoot, "apps", "workbench");

async function run(args: readonly string[], cwd = repositoryRoot) {
  const child = Bun.spawn([...args], {
    cwd,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`${args.join(" ")} exited with code ${exitCode}.`);
  }
}

await fs.rm(cliDist, { recursive: true, force: true });
await fs.mkdir(cliDist, { recursive: true });

await run([process.execPath, "run", "stories:build"], workbenchRoot);
await run([
  process.execPath,
  "build",
  path.join(cliRoot, "src", "bin.ts"),
  "--target=bun",
  "--minify",
  "--outfile",
  path.join(cliDist, "cli.js"),
]);

await fs.cp(
  path.join(workbenchRoot, "dist", "ladle"),
  path.join(cliDist, "lab"),
  {
    recursive: true,
  },
);
await fs.chmod(path.join(cliDist, "cli.js"), 0o755);

const metadata = JSON.parse(
  await fs.readFile(path.join(cliDist, "lab", "meta.json"), "utf8"),
) as { stories?: Record<string, unknown> };
const storyCount = Object.keys(metadata.stories ?? {}).length;
if (storyCount !== 13) {
  throw new Error(`Expected 13 packaged surface stories, found ${storyCount}.`);
}

console.log(`Built bb Plugin Studio CLI and ${storyCount}-story surface lab.`);
