export const RUNTIME_ERROR_CODES = [
  "invalid_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "unsupported_schema",
  "corrupt_data",
  "internal",
] as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

const PUBLIC_MESSAGES: Readonly<Record<RuntimeErrorCode, string>> = {
  invalid_request: "Invalid request",
  unauthenticated: "Authentication required",
  forbidden: "Operation not permitted",
  not_found: "Resource not found",
  conflict: "Resource conflict",
  unsupported_schema: "Unsupported data schema",
  corrupt_data: "Stored data is invalid",
  internal: "Internal error",
};

export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, options?: ErrorOptions) {
    super(PUBLIC_MESSAGES[code], options);
    this.name = "RuntimeError";
    this.code = code;
  }

  toJSON(): { code: RuntimeErrorCode; message: string } {
    return { code: this.code, message: this.message };
  }
}
