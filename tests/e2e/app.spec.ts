import { expect, test } from "@playwright/test";
import path from "node:path";

test.describe.configure({ mode: "serial" });

test("board shows the seeded invoices sorted into columns", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("col-review").locator(".col-count")).toHaveText("6");
  await expect(page.getByTestId("col-auto").locator(".col-count")).toHaveText("31");
  await expect(page.getByTestId("col-blocked").locator(".col-count")).toHaveText("2");
  await expect(page.getByTestId("col-errors").locator(".col-count")).toHaveText("1");
});

test("a blocked duplicate shows why and links to the original", async ({ page }) => {
  await page.goto("/invoices/34");
  await expect(page.getByTestId("status")).toHaveText("Blocked");
  const flag = page.getByTestId("flag-duplicate_invoice_number");
  await expect(flag).toContainText("already sent invoice BB-0917");
  await flag.getByRole("link").click();
  await expect(page).toHaveURL(/\/invoices\/18$/);
});

test("a maths error is flagged and approval is locked", async ({ page }) => {
  await page.goto("/invoices/25");
  await expect(page.getByTestId("flag-subtotal_mismatch")).toContainText("Line items add up to $1,150.00");
  await expect(page.getByTestId("approve-btn")).toBeDisabled();
});

test("a finance manager approves the over-limit invoice with a reason and it posts", async ({ page }) => {
  await page.goto("/invoices/20");
  await expect(page.getByTestId("status")).toHaveText("Waiting for manager");
  await expect(page.getByTestId("approve-btn")).toBeDisabled();
  await page.getByTestId("actor").selectOption("finance.manager");
  await expect(page.getByTestId("approve-btn")).toBeEnabled();
  await page.getByTestId("approve-reason").fill("Laptops for the new starters, matches PO-3003");
  await page.getByTestId("approve-btn").click();
  await expect(page.getByTestId("status")).toHaveText("Posted");
  await page.goto("/ledger");
  await expect(page.getByTestId("bill-20")).toContainText("SIT-7731");
});

test("a failed post waits in the error queue and a retry succeeds", async ({ page }) => {
  await page.goto("/ledger");
  await expect(page.getByTestId("error-38")).toContainText("did not respond in time");
  await page.getByTestId("retry-reason-38").fill("Accounting system is back online");
  await page.getByTestId("retry-btn-38").click();
  await expect(page.getByTestId("bill-38")).toBeVisible();
  await expect(page.getByTestId("error-queue")).toContainText("All clear");
});

test("uploading a file that was already processed is blocked", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles(path.join("samples", "invoices", "01-northgate-office-supply-NG-2031.pdf"));
  await expect(page.getByTestId("upload-zone")).toContainText("1 processed", { timeout: 20_000 });
  await expect(page.getByTestId("col-blocked").locator(".col-count")).toHaveText("3");
});

test("a new rule appears in the rules list", async ({ page }) => {
  await page.goto("/rules");
  await page.getByLabel("Rule name").fill("New vendor needs manager");
  await page.getByLabel("When").selectOption("new_vendor");
  await page.getByLabel("Send to").selectOption("manager");
  await page.getByLabel("Reason for adding this rule (required)").fill("Fraud control for new suppliers");
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByTestId("rules-list")).toContainText("New vendor needs manager");
});

test("dashboard and blocked-today pages load", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("kpis")).toContainText("Processed today");
  await page.goto("/blocked");
  await expect(page.getByTestId("blocked-list")).toContainText("Exact duplicate");
});
