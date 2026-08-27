import "server-only";

import { z } from "zod";

const serverSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SHOPIFY_API_KEY: z.string().min(1),
    SHOPIFY_API_SECRET: z.string().min(16),
    SHOPIFY_APP_STORE_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url().optional(),
    ),
    SHOPIFY_TEST_STORE_DOMAIN: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().optional(),
    ),
    SHOPIFY_API_VERSION: z.literal("2026-07").default("2026-07"),
    SHOPIFY_SCOPES: z
      .string()
      .default(
        "read_products,read_inventory,read_locations,read_orders,read_discounts",
      ),
    SHOPIFY_TOKEN_ENCRYPTION_KEY: z.string().min(1),
    SHOPIFY_TOKEN_ENCRYPTION_KEY_VERSION: z.coerce
      .number()
      .int()
      .positive()
      .default(1),
    SHOPIFY_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60000)
      .default(15000),
    DATA_INSPECTOR_PAGE_SIZE: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .default(25),
    OAUTH_STATE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(1800)
      .default(600),
  })
  .refine(
    (value) =>
      value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      value.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      message: "Provide a Supabase publishable key",
      path: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    },
  );

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .filter(Boolean)
      .join(", ");
    throw new Error(`Server configuration is incomplete: ${missing}`);
  }

  const encryptionKey = Buffer.from(
    parsed.data.SHOPIFY_TOKEN_ENCRYPTION_KEY,
    "base64",
  );
  if (encryptionKey.length !== 32) {
    throw new Error(
      "SHOPIFY_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }

  cached = parsed.data;
  return cached;
}

export function hasPublicSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

export function getShopifyAppStoreUrl() {
  const raw = process.env.SHOPIFY_APP_STORE_URL;
  if (!raw) return null;

  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "apps.shopify.com" ||
    url.pathname === "/"
  ) {
    throw new Error(
      "SHOPIFY_APP_STORE_URL must be an https://apps.shopify.com/... listing URL",
    );
  }
  return url;
}

export function getShopifyTestStoreDomain() {
  return process.env.SHOPIFY_TEST_STORE_DOMAIN || null;
}
