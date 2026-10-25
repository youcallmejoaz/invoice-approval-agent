// Takes the UI screenshots used by the portfolio and the cover images (demo mode, sample data).
//   npm run build && node docs/cover/screenshots.mjs
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const env = { ...process.env, DATA_DIR: path.join(ROOT, "clips", ".tmp", "shots"), DEMO_MODE: "1", ANTHROPIC_API_KEY: "" };
const BASE = "http://localhost:3300";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execFileSync("npx", ["tsx", "scripts/seed.ts"], { cwd: ROOT, env, stdio: "ignore" });
const server = spawn("npx", ["next", "start", "-p", "3300"], { cwd: ROOT, env, detached: true, stdio: "ignore" });
try {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch {}
    await sleep(500);
  }
  const browser = await chromium.launch();
  const shot = async (url, file, { width = 1920, height = 1080, scale = 1, wait = null } = {}) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (wait) await page.locator(wait).first().waitFor();
    await sleep(800);
    await page.screenshot({ path: path.join(ROOT, file) });
    await page.close();
  };
  await shot("/invoices/10", "docs/screenshots/invoice-detail.png", { wait: "[data-testid=invoice-file] canvas" });
  await shot("/invoices/34", "docs/screenshots/duplicate-blocked.png", { wait: "[data-testid=invoice-file] canvas" });
  await shot("/", "docs/screenshots/board.png");
  await shot("/invoices/10", "docs/cover/detail@2x.png", { width: 1500, height: 940, scale: 2, wait: "[data-testid=invoice-file] canvas" });
  await browser.close();
} finally {
  process.kill(-server.pid, "SIGTERM");
}
