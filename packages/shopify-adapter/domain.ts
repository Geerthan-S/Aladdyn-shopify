import { z } from "zod";

const shopLabel = /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export class InvalidShopDomainError extends Error {
  constructor(message = "Enter a valid myshopify.com store domain") {
    super(message);
    this.name = "InvalidShopDomainError";
  }
}

export function normalizeShopDomain(input: string): string {
  const value = z.string().trim().min(1).max(255).parse(input).toLowerCase();
  let host: string;
  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new InvalidShopDomainError();
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      (url.pathname !== "" && url.pathname !== "/") ||
      url.search ||
      url.hash
    ) {
      throw new InvalidShopDomainError(
        "Use the HTTPS myshopify.com domain without a path, port, query, or login details",
      );
    }
    host = url.hostname;
  } else {
    if (/[\/?#:@\\]/.test(value)) throw new InvalidShopDomainError();
    host = value;
  }
  const suffix = ".myshopify.com";
  const label = host.endsWith(suffix) ? host.slice(0, -suffix.length) : host;
  if (
    !shopLabel.test(label) ||
    host.split(".").length > (host.endsWith(suffix) ? 3 : 1)
  ) {
    throw new InvalidShopDomainError();
  }
  return `${label}${suffix}`;
}

export function isShopifyDomain(value: string): boolean {
  try {
    return normalizeShopDomain(value) === value.toLowerCase();
  } catch {
    return false;
  }
}
