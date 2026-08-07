import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PluginInspection } from "@bb-mate/inspection";
import { PluginInspectionCard } from "./MateOverlay";

function report(overrides: Partial<PluginInspection> = {}): PluginInspection {
  return {
    schemaVersion: 1,
    state: "ambiguous",
    outcome: "blocked",
    message: "More than one plugin package directory was found.",
    candidates: ["plugins/one", "plugins/two"],
    target: null,
    checks: [
      {
        id: "manifest.discovery",
        status: "fail",
        summary: "Plugin selection is ambiguous.",
        nextAction: "Pass the explicit plugin path to inspect.",
      },
      {
        id: "trust.disclosure",
        status: "info",
        summary: "bb plugins are full-trust local code.",
      },
    ],
    modes: {
      fixture: { available: true, detail: "Fixture ready." },
      harness: {
        available: false,
        detail: "Choose a plugin.",
        resolution: "package-not-declared",
        publication: "not-applicable",
        publishedVersion: null,
        sdkVersion: null,
      },
      live: {
        available: false,
        detail: "Choose a plugin.",
        pluginId: null,
        status: null,
        sourceKind: null,
        url: null,
      },
    },
    native: { bbVersion: null, connectUrl: null },
    provenance: null,
    trust: {
      model: "full-trust-local-code",
      entrypoints: [],
      skills: [],
      themes: [],
      hasSettings: null,
      capabilities: [],
      services: [],
      undisclosedAccess: [
        "filesystem",
        "network",
        "secrets",
        "external-services",
      ],
      detail: "Access is not disclosed.",
    },
    ...overrides,
  };
}

describe("PluginInspectionCard", () => {
  test("renders candidates and remediation when no target is selected", () => {
    const html = renderToStaticMarkup(
      <PluginInspectionCard inspection={report()} error={null} />,
    );

    expect(html).toContain("plugins/one");
    expect(html).toContain("plugins/two");
    expect(html).toContain("Pass the explicit plugin path to inspect.");
    expect(html).toContain("1 actions");
    expect(html).toContain("Full-trust local code");
  });

  test("links the upstream tracker only for a missing published SDK", () => {
    const target = {
      rootPath: "/tmp/ui",
      displayPath: "plugins/ui",
      packageName: "bb-plugin-ui",
      displayName: "UI",
      version: "1.0.0",
      serverEntry: "./server.ts",
      appEntry: "./app.tsx",
      engines: { bb: ">=0.35", pluginSdk: "^0.4.1" },
      build: { server: null, app: null },
    };
    const localFailure = report({
      target,
      modes: {
        ...report().modes,
        harness: {
          available: false,
          detail: "Local dependency cannot resolve.",
          resolution: "dependency-unresolved",
          publication: "published",
          publishedVersion: "0.4.1",
          sdkVersion: null,
        },
      },
    });
    const missingPublication = report({
      target,
      modes: {
        ...report().modes,
        harness: {
          available: false,
          detail: "Package is not published.",
          resolution: "dependency-unresolved",
          publication: "missing",
          publishedVersion: null,
          sdkVersion: null,
        },
      },
    });

    expect(
      renderToStaticMarkup(
        <PluginInspectionCard inspection={localFailure} error={null} />,
      ),
    ).not.toContain("Track SDK publication");
    expect(
      renderToStaticMarkup(
        <PluginInspectionCard inspection={missingPublication} error={null} />,
      ),
    ).toContain("Track SDK publication");
  });
});
