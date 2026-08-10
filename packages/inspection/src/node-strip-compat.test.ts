import { expect, test } from "bun:test";

test("runtime discovery errors load under Node strip-only TypeScript", async () => {
  const moduleUrl = new URL("./discovery-errors.ts", import.meta.url).href;
  const child = Bun.spawn(
    [
      "node",
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(moduleUrl)})`,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);

  expect(stderr).not.toContain("ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX");
  expect(exitCode).toBe(0);
});
