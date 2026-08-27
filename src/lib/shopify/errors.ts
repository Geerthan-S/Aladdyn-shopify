export const ERROR_CODES = [
  "AUTH_REQUIRED",
  "CONNECTION_NOT_FOUND",
  "SHOP_ACCESS_DENIED",
  "SCOPE_MISSING",
  "APPROVAL_REQUIRED",
  "TOKEN_REVOKED",
  "SHOPIFY_THROTTLED",
  "SHOPIFY_GRAPHQL_ERROR",
  "INVALID_CURSOR",
  "INVALID_DATASET",
  "NETWORK_ERROR",
  "INVALID_SHOP",
  "OWNERSHIP_CONFLICT",
  "OAUTH_INVALID",
  "OAUTH_EXPIRED",
  "CONFIGURATION_REQUIRED",
  "RATE_LIMITED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly requestId = crypto.randomUUID(),
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function safeErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          requestId: error.requestId,
        },
      },
      { status: error.status },
    );
  }

  const requestId = crypto.randomUUID();
  console.error("Unhandled connector error", {
    requestId,
    error: redactSecrets(error),
  });
  return Response.json(
    {
      error: {
        code: "NETWORK_ERROR",
        message:
          "The connector could not complete the request. Please try again.",
        requestId,
      },
    },
    { status: 500 },
  );
}

export function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/shp(at|rt)_[A-Za-z0-9_-]+/g, "[REDACTED_SHOPIFY_TOKEN]")
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
      .replace(/([?&](?:code|hmac|state)=)[^&\s]+/gi, "$1[REDACTED]")
      .replace(
        /(authorization|cookie|x-shopify-access-token)[=:]\s*[^,\s}]+/gi,
        "$1=[REDACTED]",
      );
  }
  if (value instanceof Error)
    return { name: value.name, message: redactSecrets(value.message) };
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /token|secret|cookie|authorization|code|hmac/i.test(key)
          ? "[REDACTED]"
          : redactSecrets(item),
      ]),
    );
  }
  return value;
}
