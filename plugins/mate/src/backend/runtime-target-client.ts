import { request as requestHttp } from "node:http";
import {
  BatchProjectTargetAdmissionRequestSchema,
  BatchProjectTargetAdmissionResponseSchema,
  DevelopmentTargetListResponseSchema,
  type BatchProjectTargetAdmissionRequest,
  type BatchProjectTargetAdmissionResponse,
  type DevelopmentTargetListResponse,
} from "@bb-mate/runtime/supervision";

const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface RuntimeJsonRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly authorization: string;
  readonly body: unknown;
  readonly timeoutMs: number;
}

export interface RuntimeTargetClient {
  list(): Promise<DevelopmentTargetListResponse>;
  admitProjects(
    input: Omit<BatchProjectTargetAdmissionRequest, "schemaVersion">,
  ): Promise<BatchProjectTargetAdmissionResponse>;
  dispose(): void;
}

type RequestJson = (request: RuntimeJsonRequest) => Promise<unknown>;

async function requestJson(request: RuntimeJsonRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body =
      request.body === undefined
        ? undefined
        : Buffer.from(JSON.stringify(request.body), "utf8");
    const client = requestHttp(
      request.url,
      {
        agent: false,
        method: request.method,
        headers: {
          authorization: request.authorization,
          ...(body
            ? {
                "content-length": String(body.byteLength),
                "content-type": "application/json",
              }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        response.on("data", (value: Buffer | string) => {
          const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
          bytes += chunk.byteLength;
          if (bytes > MAX_RESPONSE_BYTES) {
            response.destroy(new Error("Runtime target response too large."));
            return;
          }
          chunks.push(chunk);
        });
        response.once("error", reject);
        response.once("end", () => {
          if (
            response.statusCode !== 200 ||
            response.headers["content-type"] !==
              "application/json;charset=utf-8"
          ) {
            reject(new Error("Runtime target request failed."));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Runtime target request failed."));
          }
        });
      },
    );
    client.setTimeout(request.timeoutMs, () =>
      client.destroy(new Error("Runtime target request timed out.")),
    );
    client.once("error", reject);
    if (body) client.write(body);
    client.end();
  });
}

export function createRuntimeTargetClient(options: {
  readonly baseUrl: string;
  readonly token: Buffer;
  readonly request?: RequestJson;
}): RuntimeTargetClient {
  const request = options.request ?? requestJson;
  const token = options.token;
  let disposed = false;
  const execute = async <T>(
    method: "GET" | "POST",
    route: string,
    body: unknown,
    timeoutMs: number,
    parse: (input: unknown) => T,
  ) => {
    if (disposed) throw new Error("Runtime target request failed.");
    try {
      return parse(
        await request({
          url: `${options.baseUrl}${route}`,
          method,
          authorization: `Bearer ${token.toString("base64url")}`,
          body,
          timeoutMs,
        }),
      );
    } catch {
      throw new Error("Runtime target request failed.");
    }
  };
  return {
    list: () =>
      execute("GET", "/v2/targets", undefined, 2_000, (input) =>
        DevelopmentTargetListResponseSchema.parse(input),
      ),
    async admitProjects(input) {
      let body: unknown;
      try {
        body = BatchProjectTargetAdmissionRequestSchema.parse({
          schemaVersion: 2,
          ...input,
        });
      } catch {
        throw new Error("Runtime target request failed.");
      }
      const result = await execute(
        "POST",
        "/v2/targets/admit",
        body,
        30_000,
        (input) => BatchProjectTargetAdmissionResponseSchema.parse(input),
      );
      if (
        result.projects.length !== input.projects.length ||
        result.projects.some(
          ({ projectKey }, index) =>
            projectKey !== input.projects[index]?.projectKey,
        )
      )
        throw new Error("Runtime target request failed.");
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      token.fill(0);
    },
  };
}
