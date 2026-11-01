import { test, expect, type Page } from "@playwright/test";

/** Load the app and wait for the bundle to render. */
async function boot(page: Page) {
  await page.goto("/");
  await expect(page.locator("#version")).toContainText("837 cards");
  await expect(page.locator("#status")).toHaveText("837 cards");
}

const chip = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

test("boots and renders cards with thumbnails", async ({ page }) => {
  await boot(page);
  await expect(page.locator("#results > li.card")).toHaveCount(300);
  await expect(page.locator("#results > li.card img.thumb").first()).toHaveAttribute(
    "src",
    /Special:FilePath/,
  );
});

test("typed query runs against the engine", async ({ page }) => {
  await boot(page);
  await page.locator("#q").fill("t:attack cost:3");
  await expect(page.locator("#status")).toHaveText("8 cards");
  await expect(page.locator("#results > li.card")).toHaveCount(8);
  await expect(page.locator("#results")).toContainText("Catapult");
});

test("type chips build a choice list and support any/all", async ({ page }) => {
  await boot(page);

  await chip(page, "Action").click();
  await expect(page.locator("#query-preview")).toBeVisible();
  await expect(page.locator("#query-text")).toHaveText("t:action");
  await expect(page.locator("#status")).toHaveText("485 cards");

  await chip(page, "Treasure").click();
  await expect(page.locator("#query-text")).toHaveText("t:(action or treasure)");
  await expect(page.locator("#status")).toHaveText("573 cards");

  await page.getByLabel("Type match").selectOption("all");
  await expect(page.locator("#query-text")).toHaveText("t:action t:treasure");
  await expect(page.locator("#status")).toHaveText("3 cards");
});

test("expansion chips, including quoted multi-word sets", async ({ page }) => {
  await boot(page);

  await chip(page, "Seaside").click();
  await expect(page.locator("#query-text")).toHaveText("set:seaside");
  await expect(page.locator("#status")).toHaveText("35 cards");

  await chip(page, "Cornucopia & Guilds").click();
  await expect(page.locator("#query-text")).toHaveText(
    'set:(seaside or "cornucopia & guilds")',
  );
  await expect(page.locator("#status")).toHaveText("49 cards");
});

test("cost, potion and edition controls emit their syntax", async ({ page }) => {
  await boot(page);

  await page.getByLabel("$ min", { exact: true }).fill("3");
  await expect(page.locator("#query-text")).toHaveText("cost>=3");

  await page.getByLabel("$ max", { exact: true }).fill("5");
  await expect(page.locator("#query-text")).toHaveText("cost>=3 cost<=5");

  await page.getByLabel("Potion", { exact: true }).selectOption("yes");
  await expect(page.locator("#query-text")).toHaveText("cost>=3 cost<=5 potion:1");

  await page.getByLabel("Edition", { exact: true }).selectOption("2E");
  await expect(page.locator("#query-text")).toHaveText(
    "cost>=3 cost<=5 potion:1 edition:2e",
  );

  // the emitted query is valid and runs
  await expect(page.locator("#status")).toHaveText("0 cards");
});

test("trait flags emit is:/has: terms", async ({ page }) => {
  await boot(page);

  await chip(page, "Kingdom").click();
  await expect(page.locator("#query-text")).toHaveText("is:kingdom");
  await expect(page.locator("#status")).toHaveText("544 cards");

  await chip(page, "Overpay").click();
  await expect(page.locator("#query-text")).toHaveText("is:kingdom has:overpay");
});

test("typed query and visual filters are AND-ed and grouped", async ({ page }) => {
  await boot(page);

  await page.locator("#q").fill("t:attack");
  await expect(page.locator("#status")).toHaveText("93 cards");

  await chip(page, "Action").click();
  await expect(page.locator("#query-text")).toHaveText("(t:attack) t:action");
  await expect(page.locator("#status")).toHaveText("87 cards");
});

test("Clear removes filters but keeps the typed query", async ({ page }) => {
  await boot(page);

  await page.locator("#q").fill("t:attack");
  await chip(page, "Action").click();
  await expect(page.locator("#query-preview")).toBeVisible();

  await chip(page, "Clear").click();
  await expect(page.locator("#query-preview")).toBeHidden();
  await expect(page.locator("#q")).toHaveValue("t:attack");
  await expect(page.locator("#status")).toHaveText("93 cards");
});

test("filters collapse and expand", async ({ page }) => {
  await boot(page);
  const rows = page.locator("#filters .filter-row");

  await expect(rows.first()).toBeVisible();
  await chip(page, "Hide").click();
  await expect(page.locator("#filters")).toHaveClass(/collapsed/);
  await expect(rows.first()).toBeHidden();

  await chip(page, "Show").click();
  await expect(rows.first()).toBeVisible();
});

test("showing every type does not overflow horizontally", async ({ page }) => {
  await boot(page);
  await page.getByRole("button", { name: /^\+\d+ more$/ }).click();
  await chip(page, "Cornucopia & Guilds").click();
  await page.getByLabel("$ min", { exact: true }).fill("2");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("syntax primer example runs and returns to the search", async ({ page }) => {
  await boot(page);

  await page.locator("#show-primer").click();
  await expect(page.locator("#primer")).toBeVisible();

  await page
    .locator("#primer .ex code.chip")
    .filter({ hasText: "t:attack cost:3" })
    .first()
    .click();

  await expect(page.locator("#primer")).toBeHidden();
  await expect(page.locator("#q")).toHaveValue("t:attack cost:3");
  await expect(page.locator("#status")).toHaveText("8 cards");
});

test("works offline after the service worker installs", async ({ page, context }) => {
  test.slow();
  await boot(page);

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#version")).toContainText("837 cards");
  await expect(page.locator("#status")).toHaveText("837 cards");

  await page.locator("#q").fill("t:event");
  await expect(page.locator("#status")).toHaveText("79 cards");

  await context.setOffline(false);
});
