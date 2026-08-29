import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: {
    alias: {
      "@commerce-agent": fileURLToPath(
        new URL("./packages/commerce-agent", import.meta.url),
      ),
      "@shopify-adapter": fileURLToPath(
        new URL("./packages/shopify-adapter", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/fixtures/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/unit/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "evaluation/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/lib/shopify/**/*.ts"],
    },
  },
});
