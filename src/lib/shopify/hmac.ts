import { createHmac, timingSafeEqual } from "node:crypto";

function safeEqual(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function canonicalizeOAuthParams(params: URLSearchParams): string {
  return [...new Set(params.keys())]
    .filter((key) => key !== "hmac" && key !== "signature")
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${params.getAll(key).join(",")}`)
    .join("&");
}

export function signOAuthParams(params: URLSearchParams, secret: string) {
  return createHmac("sha256", secret)
    .update(canonicalizeOAuthParams(params))
    .digest("hex");
}

export function verifyOAuthHmac(
  params: URLSearchParams,
  secret: string,
): boolean {
  const supplied = params.get("hmac");
  if (!supplied || !/^[a-f0-9]{64}$/i.test(supplied)) return false;

  const calculated = signOAuthParams(params, secret);
  return safeEqual(
    Buffer.from(supplied, "hex"),
    Buffer.from(calculated, "hex"),
  );
}

export function signWebhookBody(body: string | Buffer, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64");
}

export function verifyWebhookHmac(
  body: string | Buffer,
  suppliedHmac: string | null,
  secret: string,
): boolean {
  if (!suppliedHmac) return false;
  let supplied: Buffer;
  try {
    supplied = Buffer.from(suppliedHmac, "base64");
  } catch {
    return false;
  }
  const calculated = Buffer.from(signWebhookBody(body, secret), "base64");
  return safeEqual(supplied, calculated);
}
