// Renders the Upwork cover images from cover-a.html and cover-b.html (1600x1200, 1000x750, and a 400x300 preview).
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const DIR = path.dirname(new URL(import.meta.url).pathname);
const DOCS = path.resolve(DIR, "..");
const browser = await chromium.launch();
for (const v of ["a", "b"]) {
  for (const [w, h, suffix] of [[1600, 1200, ""], [1000, 750, "-1000"], [400, 300, "-preview-400"]]) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: w / 1600 });
    await page.goto("file://" + path.join(DIR, `cover-${v}.html`), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(DOCS, `upwork-cover-${v}${suffix}.png`) });
    await page.close();
  }
}
await browser.close();
