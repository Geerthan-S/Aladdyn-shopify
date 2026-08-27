import { expect, test } from "@playwright/test";

test("publishes the exact Aladdyn UCP agent profile", async ({ request }) => {
  const response = await request.get("/.well-known/ucp");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({
    ucp: {
      version: "2026-04-08",
      capabilities: {
        "dev.ucp.shopping.catalog.search": [{ version: "2026-04-08" }],
        "dev.ucp.shopping.catalog.lookup": [{ version: "2026-04-08" }],
        "dev.ucp.shopping.cart": [{ version: "2026-04-08" }],
        "dev.ucp.shopping.checkout": [{ version: "2026-04-08" }],
      },
    },
  });
  expect(response.headers()["access-control-allow-origin"]).toBe("*");
});

test("protects Genie behind Aladdyn authentication", async ({ page }) => {
  await page.goto("/genie");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
});
