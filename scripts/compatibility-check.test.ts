import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { surfaceCatalog } from "../apps/workbench/src/surface-catalog";
import {
  evaluateCompatibility,
  formatCompatibilityReport,
  observeBbVersion,
  parseCompatibilityTarget,
  resolveCompatibilityDecisionPath,
  validCompatibilityDecision,
  type CompatibilityObservations,
  type CompatibilityTarget,
} from "./compatibility-check";

describe("native bb version probe", () => {
  test("sanitizes re-exec selectors and parses the bounded command result", async () => {
    const version = await observeBbVersion(
      "/fake/bb",
      async (executable, args, _cwd, options) => {
        expect(executable).toBe("/fake/bb");
        expect(args).toEqual(["--version"]);
        expect(options?.env?.BB_CLI).toBeUndefined();
        expect(options?.env?.BB_CLI_REEXEC).toBeUndefined();
        return { stdout: "bb 0.36.0\n", stderr: "", exitCode: 0 };
      },
    );
    expect(version).toBe("0.36.0");
  });

  test("reports bounded native failures instead of accepting partial output", async () => {
    await expect(
      observeBbVersion("/fake/bb", async () => ({
        stdout: "0.36.0\n",
        stderr: "Native command timed out after 10000ms.",
        exitCode: 124,
      })),
    ).rejects.toThrow("timed out");
  });

  test.each(["spawn bb ENOENT", 'Executable not found in $PATH: "bb"'])(
    "falls back to the workspace pin for missing executable: %s",
    async (stderr) => {
      const candidates: string[] = [];
      const version = await observeBbVersion("", async (executable) => {
        candidates.push(executable);
        return executable === "bb"
          ? { stdout: "", stderr, exitCode: 1 }
          : { stdout: "0.36.0\n", stderr: "", exitCode: 0 };
      });
      expect(candidates).toEqual([
        "bb",
        path.resolve("plugins/mate/node_modules/.bin/bb"),
      ]);
      expect(version).toBe("0.36.0");
    },
  );
});

const target: CompatibilityTarget = {
  schemaVersion: 1,
  acceptedDecision: null,
  target: {
    bbVersion: "0.35.1",
    pluginSdkVersion: "0.4.1",
    pluginSdkEngineRange: "^0.4.1",
    upstreamRef: "desktop-v0.35.1",
  },
  publicArtifacts: {
    appPackageUrl:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.35.1/apps/app/package.json",
    pluginSdkPackageUrl:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.35.1/packages/plugin-sdk/package.json",
    themeCssUrl:
      "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.35.1/apps/app/src/components/ui/theme.css",
    registry: {
      url: "https://raw.githubusercontent.com/get-bb/bb/desktop-v0.35.1/packages/plugin-registry/r/index.json",
      sha256: "abc",
      items: ["button"],
    },
  },
  dependencies: [
    {
      id: "icons",
      package: "icons",
      localRange: "^1.0.0",
      upstreamRange: "^1.0.0",
    },
  ],
  measuredTokens: [
    {
      name: "--row-height",
      localValue: "1rem",
      upstreamValue: "1rem",
      source: "public-theme-css",
    },
  ],
  registrationPaths: ["slots.example"],
};

function matchingObservations(): CompatibilityObservations {
  return {
    bbVersion: "0.35.1",
    pluginSdkEngineRange: "^0.4.1",
    pluginSdkVersion: "0.4.1",
    registrySha256: "abc",
    registryItems: ["button"],
    dependencies: { icons: { local: "^1.0.0", upstream: "^1.0.0" } },
    tokens: { "--row-height": { local: "1rem", upstream: "1rem" } },
    registrationPaths: ["slots.example"],
  };
}

describe("compatibility evaluation", () => {
  test("passes a completely matching observation", () => {
    const report = evaluateCompatibility(target, matchingObservations());
    expect(report.outcome).toBe("pass");
    expect(report.checks.every(({ status }) => status === "pass")).toBe(true);
  });

  test("fails when release identity and immutable URLs diverge", () => {
    const incoherent: CompatibilityTarget = {
      ...target,
      target: { ...target.target, upstreamRef: "desktop-v9.9.9" },
    };
    expect(
      evaluateCompatibility(incoherent, matchingObservations()).checks.find(
        ({ id }) => id === "target.release-coherence",
      ),
    ).toMatchObject({
      status: "fail",
      observed: expect.arrayContaining([expect.any(String)]),
    });
  });

  test.each([
    [
      "bb version",
      (value: CompatibilityObservations) => (value.bbVersion = "0.36.0"),
      "bb.version",
    ],
    [
      "SDK engine",
      (value: CompatibilityObservations) =>
        (value.pluginSdkEngineRange = "^0.5.0"),
      "plugin-sdk.engine-range",
    ],
    [
      "SDK version",
      (value: CompatibilityObservations) => (value.pluginSdkVersion = "0.5.0"),
      "plugin-sdk.public-version",
    ],
    [
      "registry digest",
      (value: CompatibilityObservations) => (value.registrySha256 = "def"),
      "component-registry.sha256",
    ],
    [
      "registry items",
      (value: CompatibilityObservations) =>
        (value.registryItems = ["button", "card"]),
      "component-registry.items",
    ],
    [
      "local dependency",
      (value: CompatibilityObservations) =>
        (value.dependencies.icons!.local = "^2.0.0"),
      "dependency.icons.local",
    ],
    [
      "upstream dependency",
      (value: CompatibilityObservations) =>
        (value.dependencies.icons!.upstream = "^2.0.0"),
      "dependency.icons.upstream",
    ],
    [
      "local token",
      (value: CompatibilityObservations) =>
        (value.tokens["--row-height"]!.local = "2rem"),
      "token.--row-height.local",
    ],
    [
      "upstream token",
      (value: CompatibilityObservations) =>
        (value.tokens["--row-height"]!.upstream = "2rem"),
      "token.--row-height.upstream",
    ],
    [
      "registration paths",
      (value: CompatibilityObservations) =>
        (value.registrationPaths = ["slots.new"]),
      "plugin-registration.paths",
    ],
  ])("reports precise %s drift", (_name, mutate, checkId) => {
    const observed = matchingObservations();
    mutate(observed);
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("fail");
    expect(report.checks.find(({ id }) => id === checkId)).toMatchObject({
      status: "fail",
      nextAction: expect.any(String),
    });
  });

  test("fails closed when a public probe is unverified", () => {
    const observed = matchingObservations();
    observed.registrySha256 = undefined;
    observed.registryItems = undefined;
    observed.registryError = "network unavailable";
    const report = evaluateCompatibility(target, observed);
    expect(report.outcome).toBe("fail");
    expect(
      report.checks.filter(({ id }) => id.startsWith("component-registry")),
    ).toEqual([
      expect.objectContaining({
        status: "unverified",
        observed: "network unavailable",
      }),
      expect.objectContaining({
        status: "unverified",
        observed: "network unavailable",
      }),
    ]);
  });

  test("formats a concise actionable terminal report", () => {
    const observed = matchingObservations();
    observed.bbVersion = "0.36.0";
    const output = formatCompatibilityReport(
      evaluateCompatibility(target, observed),
    );
    expect(output).toContain("BB Mate compatibility: fail");
    expect(output).toContain("✗ bb.version: fail");
    expect(output).toContain("next:");
  });
});

describe("explicit compatibility decisions", () => {
  test("requires accepted status, owner, reason, and an unexpired date", () => {
    const now = new Date("2026-08-07T12:00:00Z");
    expect(
      validCompatibilityDecision(
        "# Compatibility Decision\nStatus: accepted\nOwner: Matt\nReason: bounded migration\nExpires: 2026-08-08\n",
        now,
      ),
    ).toBe(true);
    expect(
      validCompatibilityDecision(
        "Status: accepted\nOwner: Matt\nReason: bounded migration\nExpires: 2026-08-06\n",
        now,
      ),
    ).toBe(false);
    expect(validCompatibilityDecision("Status: accepted\n", now)).toBe(false);
    expect(
      validCompatibilityDecision(
        "Status: accepted\nOwner: Matt\nReason: invalid date\nExpires: 9999-99-99\n",
        now,
      ),
    ).toBe(false);
  });

  test("requires a target-declared repository decision path", () => {
    const withDecision = {
      ...target,
      acceptedDecision: "compatibility/decisions/bounded.md",
    };
    expect(() =>
      resolveCompatibilityDecisionPath(withDecision, "/dev/stdin"),
    ).toThrow("acceptedDecision");
    expect(
      resolveCompatibilityDecisionPath(
        withDecision,
        "compatibility/decisions/bounded.md",
      ),
    ).toEndWith("/compatibility/decisions/bounded.md");
  });
});

describe("target validation", () => {
  test("rejects removed guard families and non-public artifact URLs", () => {
    expect(() =>
      parseCompatibilityTarget({ ...target, dependencies: [] }),
    ).toThrow("dependencies");
    expect(() =>
      parseCompatibilityTarget({
        ...target,
        publicArtifacts: {
          ...target.publicArtifacts,
          appPackageUrl: "https://example.test/app.json",
        },
      }),
    ).toThrow("immutable public");
  });
});

test("the checked-in target mirrors the catalog registration paths", async () => {
  const text = await readFile(
    path.resolve("compatibility/bb-target.json"),
    "utf8",
  );
  const checkedTarget = JSON.parse(text) as CompatibilityTarget;
  expect(checkedTarget.registrationPaths).toEqual(
    surfaceCatalog.map(({ registrationPath }) => registrationPath),
  );
});

test("keeps local checks valid when only an upstream probe fails", () => {
  const observed = matchingObservations();
  observed.dependencies.icons = {
    local: "^1.0.0",
    upstreamError: "public app package unavailable",
  };
  observed.tokens["--row-height"] = {
    local: "1rem",
    upstreamError: "public theme unavailable",
  };
  const checks = evaluateCompatibility(target, observed).checks;
  expect(checks.find(({ id }) => id === "dependency.icons.local")?.status).toBe(
    "pass",
  );
  expect(
    checks.find(({ id }) => id === "dependency.icons.upstream")?.status,
  ).toBe("unverified");
  expect(
    checks.find(({ id }) => id === "token.--row-height.local")?.status,
  ).toBe("pass");
  expect(
    checks.find(({ id }) => id === "token.--row-height.upstream")?.status,
  ).toBe("unverified");
});
