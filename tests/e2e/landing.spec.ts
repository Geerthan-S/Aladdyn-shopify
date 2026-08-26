import { expect, test } from "@playwright/test";

test("landing page leads to account creation without requesting Shopify credentials", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Bring your Shopify data/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/never asks for or stores your Shopify admin password/i),
  ).toBeVisible();
  await page
    .getByRole("link", { name: /Create account/i })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Create your account" }),
  ).toBeVisible();
});
