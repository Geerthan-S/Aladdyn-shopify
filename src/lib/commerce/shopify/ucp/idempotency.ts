import { createHash } from "node:crypto";

export function commerceIdempotencyKey(
  conversationId: string,
  messageId: string,
  operation: string,
  cartVersion: number,
) {
  return createHash("sha256")
    .update(`${conversationId}:${messageId}:${operation}:${cartVersion}`)
    .digest("hex");
}

export function requestHash(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function providerIdempotencyKey(key: string) {
  const hex = /^[a-f0-9]{64}$/i.test(key)
    ? key.toLowerCase()
    : createHash("sha256").update(key).digest("hex");
  const bytes = hex.slice(0, 32).split("");
  bytes[12] = "5";
  bytes[16] = ((Number.parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
  const normalized = bytes.join("");
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20, 32)}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
