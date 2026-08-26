import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";

export type TokenBundle = {
  accessToken: string;
  refreshToken: string;
};

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

function encryptionKey() {
  return Buffer.from(getServerEnv().SHOPIFY_TOKEN_ENCRYPTION_KEY, "base64");
}

export function encryptTokenBundle(bundle: TokenBundle): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(bundle), "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: getServerEnv().SHOPIFY_TOKEN_ENCRYPTION_KEY_VERSION,
  };
}

export function decryptTokenBundle(secret: EncryptedSecret): TokenBundle {
  if (
    secret.keyVersion !== getServerEnv().SHOPIFY_TOKEN_ENCRYPTION_KEY_VERSION
  ) {
    throw new Error("Unsupported token encryption key version");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(secret.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(secret.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(plaintext) as Partial<TokenBundle>;
  if (!parsed.accessToken || !parsed.refreshToken) {
    throw new Error("Encrypted token payload is invalid");
  }
  return parsed as TokenBundle;
}
