import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { readSupervisorChannel } from "./supervisor-channel.ts";

describe("supervisor channel", () => {
  test("reads one bounded frame and treats the remaining stream as liveness", async () => {
    const stream = new PassThrough();
    const opened = readSupervisorChannel(stream, (value) => JSON.parse(value), {
      timeoutMs: 100,
    });

    stream.write('{"schemaVersion":1}\n');
    const channel = await opened;

    expect(channel.frame).toEqual({ schemaVersion: 1 });
    let closed = false;
    void channel.closed.then(() => {
      closed = true;
    });
    await Bun.sleep(0);
    expect(closed).toBe(false);
    stream.end();
    await expect(channel.closed).resolves.toBeUndefined();
  });

  test("rejects queued and later bytes after the single frame", async () => {
    const queued = new PassThrough();
    const queuedRead = readSupervisorChannel(
      queued,
      (value) => JSON.parse(value),
      {
        timeoutMs: 100,
      },
    );
    queued.end('{"schemaVersion":1}\nextra');
    await expect(queuedRead).rejects.toThrow(
      "Supervisor channel accepts exactly one frame.",
    );

    const split = new PassThrough();
    const splitRead = readSupervisorChannel(
      split,
      (value) => JSON.parse(value),
      {
        timeoutMs: 100,
      },
    );
    split.write('{"schemaVersion":1}\n');
    split.write("extra");
    const splitChannel = await splitRead;
    await expect(splitChannel.closed).rejects.toThrow(
      "Supervisor channel accepts exactly one frame.",
    );

    const later = new PassThrough();
    const laterRead = readSupervisorChannel(
      later,
      (value) => JSON.parse(value),
      {
        timeoutMs: 100,
      },
    );
    later.write('{"schemaVersion":1}\n');
    const channel = await laterRead;
    later.write("extra");
    await expect(channel.closed).rejects.toThrow(
      "Supervisor channel accepts exactly one frame.",
    );
  });

  test("bounds frame bytes and wait time before parsing", async () => {
    const oversized = new PassThrough();
    const oversizedRead = readSupervisorChannel(oversized, (value) => value, {
      timeoutMs: 100,
    });
    oversized.end(`${"x".repeat(4_096)}\n`);
    await expect(oversizedRead).rejects.toThrow(
      "Supervisor frame exceeds 4096 bytes.",
    );
    expect(oversized.destroyed).toBe(true);

    const silent = new PassThrough();
    await expect(
      readSupervisorChannel(silent, (value) => value, { timeoutMs: 1 }),
    ).rejects.toThrow("Timed out waiting for the supervisor frame.");
    expect(silent.destroyed).toBe(true);
  });
});
