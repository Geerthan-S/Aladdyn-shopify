import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildCommerceSystemPrompt } from "@commerce-agent/ai/prompt";

let cachedRules: string | null = null;
const RULE_FILES = [
  "global.md",
  "commerce.md",
  "personalization.md",
  "security.md",
];

export async function buildSystemPrompt(context: string) {
  if (!cachedRules) {
    cachedRules = (
      await Promise.all(
        RULE_FILES.map((file) =>
          readFile(
            path.join(process.cwd(), "src", "lib", "ai", "rules", file),
            "utf8",
          ),
        ),
      )
    )
      .map((value) => value.trim())
      .join("\n\n");
  }
  return buildCommerceSystemPrompt({ rules: [cachedRules], context });
}
