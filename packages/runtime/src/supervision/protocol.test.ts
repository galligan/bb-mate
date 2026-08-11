import { describe, expect, test } from "bun:test";

import { OpaqueIdSchema } from "../contracts/ids.ts";
import {
  parseRuntimeLaunchDescriptor,
  parseSupervisorFrame,
  RUNTIME_CAPABILITIES,
  RuntimeCapabilityDocumentSchema,
  serializeRuntimeLaunchDescriptor,
} from "./protocol.ts";

const instanceId = OpaqueIdSchema.parse("d".repeat(32));
const token = Buffer.alloc(32, 7).toString("base64url");

const validFrame = {
  schemaVersion: 2,
  expectedRuntimeVersion: "0.1.0",
  expectedApiVersion: 2,
  token,
  dataRoot: "/private/runtime-data",
} as const;

describe("supervised runtime protocol", () => {
  test("parses the strict v2 supervisor frame", () => {
    expect(parseSupervisorFrame(`${JSON.stringify(validFrame)}\n`)).toEqual({
      schemaVersion: 2,
      expectedRuntimeVersion: "0.1.0",
      expectedApiVersion: 2,
      token,
      dataRoot: "/private/runtime-data",
    });
  });

  test("rejects supervisor frame drift, invalid credentials, and framing overflow", () => {
    const cases: Array<string | Uint8Array> = [
      JSON.stringify({ ...validFrame, extra: true }),
      JSON.stringify({ ...validFrame, token: `${token}=` }),
      JSON.stringify({ ...validFrame, token: "!".repeat(43) }),
      JSON.stringify({ ...validFrame, token: token.slice(1) }),
      JSON.stringify({ ...validFrame, expectedRuntimeVersion: "latest" }),
      JSON.stringify({ ...validFrame, expectedRuntimeVersion: "1.0.0-01" }),
      JSON.stringify({ ...validFrame, schemaVersion: 1 }),
      JSON.stringify({ ...validFrame, expectedApiVersion: 1 }),
      JSON.stringify({ ...validFrame, dataRoot: "relative/runtime-data" }),
      JSON.stringify({ ...validFrame, dataRoot: "/private/../runtime-data" }),
      JSON.stringify({ ...validFrame, dataRoot: "/private//runtime-data" }),
      JSON.stringify({ ...validFrame, dataRoot: "/private/runtime\u0000data" }),
      JSON.stringify({ ...validFrame, dataRoot: `/${"x".repeat(1_025)}` }),
      JSON.stringify({ ...validFrame, principalId: "a".repeat(32) }),
      `${JSON.stringify(validFrame)}\n\n`,
      `${JSON.stringify(validFrame)}\n{}`,
      `${JSON.stringify(validFrame)}${" ".repeat(4 * 1024)}`,
      new Uint8Array([0xc3, 0x28]),
    ];

    for (const input of cases) {
      expect(() => parseSupervisorFrame(input)).toThrow(
        new TypeError("Invalid supervisor frame"),
      );
    }
  });

  test("serializes and parses one canonical bounded launch descriptor line", () => {
    const descriptor = {
      schemaVersion: 2,
      protocol: "bb-mate-runtime",
      runtimeVersion: "0.1.0-beta.1+build.2",
      apiVersion: 2,
      pid: 42,
      instanceId,
      baseUrl: "http://127.0.0.1:41721",
      capabilities: RUNTIME_CAPABILITIES,
    } as const;

    const line = serializeRuntimeLaunchDescriptor(descriptor);

    expect(line.endsWith("\n")).toBe(true);
    expect(line.indexOf("\n")).toBe(line.length - 1);
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(8 * 1024);
    expect(parseRuntimeLaunchDescriptor(line)).toEqual(descriptor);
    expect(line).toBe(
      `${JSON.stringify({
        apiVersion: 2,
        baseUrl: "http://127.0.0.1:41721",
        capabilities: RUNTIME_CAPABILITIES,
        instanceId,
        pid: 42,
        protocol: "bb-mate-runtime",
        runtimeVersion: "0.1.0-beta.1+build.2",
        schemaVersion: 2,
      })}\n`,
    );
  });

  test("rejects descriptor drift, secrets, non-loopback URLs, and overflow", () => {
    const descriptor = {
      schemaVersion: 2,
      protocol: "bb-mate-runtime",
      runtimeVersion: "0.1.0",
      apiVersion: 2,
      pid: 42,
      instanceId,
      baseUrl: "http://127.0.0.1:41721",
      capabilities: RUNTIME_CAPABILITIES,
    } as const;
    const invalid = [
      { ...descriptor, token },
      { ...descriptor, apiVersion: 1 },
      { ...descriptor, schemaVersion: 1 },
      { ...descriptor, pid: 0 },
      { ...descriptor, baseUrl: "http://localhost:41721" },
      { ...descriptor, baseUrl: "http://127.0.0.1:41721/healthz" },
      { ...descriptor, baseUrl: "http://127.0.0.1:0" },
      { ...descriptor, baseUrl: "http://127.0.0.1:65536" },
      {
        ...descriptor,
        capabilities: { ...RUNTIME_CAPABILITIES, unknown: false },
      },
    ];

    for (const input of invalid) {
      expect(() => serializeRuntimeLaunchDescriptor(input)).toThrow(
        new TypeError("Invalid runtime launch descriptor"),
      );
    }
    expect(() =>
      parseRuntimeLaunchDescriptor(
        `${JSON.stringify(descriptor)}${" ".repeat(8 * 1024)}`,
      ),
    ).toThrow(new TypeError("Invalid runtime launch descriptor"));
    expect(() =>
      parseRuntimeLaunchDescriptor(new Uint8Array([0xc3, 0x28])),
    ).toThrow(new TypeError("Invalid runtime launch descriptor"));
  });

  test("defines the exact public capability handshake document", () => {
    const document = {
      schemaVersion: 2,
      runtimeVersion: "0.1.0",
      apiVersion: 2,
      instanceId,
      capabilities: RUNTIME_CAPABILITIES,
    } as const;

    expect(RuntimeCapabilityDocumentSchema.parse(document)).toEqual(document);
    expect(() =>
      RuntimeCapabilityDocumentSchema.parse({ ...document, token }),
    ).toThrow();
    expect(() =>
      RuntimeCapabilityDocumentSchema.parse({
        ...document,
        baseUrl: "http://127.0.0.1:41721",
      }),
    ).toThrow();
  });
});
