import type { Readable } from "node:stream";

const DEFAULT_FRAME_BYTES = 4_096;
const DEFAULT_TIMEOUT_MS = 2_000;

function unexpectedClose(): Error {
  return new Error("Supervisor channel closed unexpectedly.");
}

export interface SupervisorChannel<Frame> {
  readonly frame: Frame;
  readonly closed: Promise<void>;
}

export async function readSupervisorChannel<Frame>(
  stream: Readable,
  parseFrame: (value: string) => Frame,
  options: {
    readonly maxBytes?: number;
    readonly timeoutMs?: number;
  } = {},
): Promise<SupervisorChannel<Frame>> {
  const maxBytes = options.maxBytes ?? DEFAULT_FRAME_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const chunks: Buffer[] = [];
  let byteLength = 0;

  let firstLine: Buffer;
  try {
    firstLine = await new Promise<Buffer>((resolve, reject) => {
      const timeout = setTimeout(
        () => finish(new Error("Timed out waiting for the supervisor frame.")),
        timeoutMs,
      );

      const cleanup = () => {
        clearTimeout(timeout);
        stream.off("data", onData);
        stream.off("end", onEnd);
        stream.off("close", onClose);
        stream.off("error", finish);
      };
      const finish = (error: unknown, value?: Buffer) => {
        cleanup();
        if (error) reject(error);
        else resolve(value as Buffer);
      };
      const onEnd = () =>
        finish(new Error("Supervisor channel closed before its frame."));
      const onClose = () => finish(unexpectedClose());
      const onData = (value: Buffer | string) => {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const newline = chunk.indexOf(0x0a);
        const accepted = newline === -1 ? chunk : chunk.subarray(0, newline);
        byteLength += accepted.byteLength + (newline === -1 ? 0 : 1);
        chunks.push(accepted);
        if (byteLength > maxBytes) {
          finish(new Error("Supervisor frame exceeds 4096 bytes."));
          return;
        }
        if (newline === -1) return;
        stream.pause();
        if (newline !== chunk.byteLength - 1) {
          finish(new Error("Supervisor channel accepts exactly one frame."));
          return;
        }
        finish(undefined, Buffer.concat(chunks, byteLength - 1));
      };

      stream.on("data", onData);
      stream.once("end", onEnd);
      stream.once("close", onClose);
      stream.once("error", finish);
    });
  } catch (error) {
    for (const chunk of chunks) chunk.fill(0);
    stream.destroy();
    throw error;
  }

  let frame: Frame;
  try {
    let decoded: string;
    try {
      decoded = new TextDecoder("utf-8", { fatal: true }).decode(firstLine);
    } catch (error) {
      throw new Error("Supervisor frame must be valid UTF-8.", {
        cause: error,
      });
    }
    frame = parseFrame(decoded);
  } catch (error) {
    stream.destroy();
    throw error;
  } finally {
    firstLine.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }

  if (stream.readableEnded) {
    return { frame, closed: Promise.resolve() };
  }
  if (stream.destroyed) {
    const closed = Promise.reject(unexpectedClose());
    void closed.catch(() => undefined);
    return { frame, closed };
  }
  const closed = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.off("data", onData);
      stream.off("end", onEnd);
      stream.off("close", onClose);
      stream.off("error", onError);
    };
    const onData = () => {
      cleanup();
      reject(new Error("Supervisor channel accepts exactly one frame."));
    };
    const onEnd = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(unexpectedClose());
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    stream.on("data", onData);
    stream.once("end", onEnd);
    stream.once("close", onClose);
    stream.once("error", onError);
  });
  stream.resume();

  return { frame, closed };
}
