import { describe, expect, test } from "bun:test";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import { RuntimeError } from "../errors.ts";
import { parsePrivateHostObservation } from "./private-host-observation.ts";

const runtimeInstanceId = OpaqueIdSchema.parse("i".repeat(32));

function validObservation() {
  return {
    runtimeInstanceId,
    hostname: "studio.local",
    bbHost: {
      id: "desktop-host",
      name: "Development Mac",
      isServer: true,
    },
    observedAt: 1_000,
  };
}

describe("private host observations", () => {
  test("accepts only the bounded local host evidence needed for reconciliation", () => {
    expect(parsePrivateHostObservation(validObservation())).toEqual(
      validObservation(),
    );
    expect(
      parsePrivateHostObservation({
        runtimeInstanceId,
        hostname: "localhost",
        observedAt: 1_000,
      }),
    ).toEqual({ runtimeInstanceId, hostname: "localhost", observedAt: 1_000 });
  });

  test.each([
    ["URL", { hostname: "https://studio.local" }],
    ["port", { hostname: "studio.local:8080" }],
    ["credentials", { hostname: "user@studio.local" }],
    [
      "host metadata URL",
      {
        bbHost: { ...validObservation().bbHost, name: "https://host.invalid" },
      },
    ],
    [
      "host metadata port",
      { bbHost: { ...validObservation().bbHost, id: "host:8080" } },
    ],
    [
      "host metadata credentials",
      { bbHost: { ...validObservation().bbHost, name: "user@host" } },
    ],
    ["unbounded hostname", { hostname: "a".repeat(254) }],
    [
      "unbounded host id",
      { bbHost: { ...validObservation().bbHost, id: "i".repeat(129) } },
    ],
    [
      "unbounded host name",
      { bbHost: { ...validObservation().bbHost, name: "n".repeat(129) } },
    ],
    ["reachability", { reachable: true }],
    ["same-host verdict", { sameHost: true }],
    ["same-instance verdict", { sameInstance: true }],
    ["browser availability", { browserAvailable: true }],
    ["topology", { topology: "local" }],
    ["proxy", { proxyUrl: "https://proxy.invalid" }],
    ["tunnel", { tunnel: true }],
    ["sharing", { shareUrl: "https://share.invalid" }],
  ])("rejects %s fields", (_label, override) => {
    expect(() =>
      parsePrivateHostObservation({ ...validObservation(), ...override }),
    ).toThrow(RuntimeError);
  });
});
