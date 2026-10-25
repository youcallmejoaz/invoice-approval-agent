// Records the UI clips, explainer cards and prompt replays for the video, in demo mode.
//   npm run build && node clips/record.mjs            (all scenes)
//   node clips/record.mjs C03 C04                     (only some scenes)
// Output: clips/<ID>_<name>.mp4 (H.264, yuv420p, 30 fps), close-ups as <ID>_<name>_close.mp4, card stills as PNG.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CLIPS = path.join(ROOT, "clips");
const TMP = path.join(CLIPS, ".tmp");
const DATA = path.join(TMP, "data");
const PORT = 3200;
const BASE = `http://localhost:${PORT}`;
const W = 1920;
const H = 1080;
const PAUSE = 750; // after each action
const CPS = 12; // typing speed, characters per second

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = { ...process.env, DATA_DIR: DATA, DEMO_MODE: "1", ACCOUNTING_ADAPTER: "mock", ANTHROPIC_API_KEY: "" };

// ---------- app server ----------
let server = null;
function seed(empty) {
  execFileSync("npx", ["tsx", "scripts/seed.ts", ...(empty ? ["--empty"] : [])], { cwd: ROOT, env, stdio: "ignore" });
}
async function startServer() {
  server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env, detached: true, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error("server did not start");
}
function stopServer() {
  if (server) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    server = null;
  }
}
async function ensureApp() {
  if (!server) await freshApp(false);
}
async function freshApp(empty = false) {
  stopServer();
  await sleep(500);
  seed(empty);
  await startServer();
}

// ---------- visible cursor and click rings ----------
const CURSOR_SCRIPT = () => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 34px; height: 34px; transition: none; }
      #__cursor svg { filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
      .__ring { position: fixed; z-index: 2147483646; pointer-events: none; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%;
        border: 4px solid #0d9488; background: rgba(20,184,166,.18); animation: __ring .7s ease-out forwards; }
      @keyframes __ring { from { transform: scale(.4); opacity: 1; } to { transform: scale(2.6); opacity: 0; } }
      #__drag { position: fixed; z-index: 2147483645; pointer-events: none; display: none; padding: 12px 18px; border-radius: 12px; background: #0f766e;
        color: #fff; font: 600 18px Inter, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,.25); }`;
    document.head.appendChild(style);
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = `<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2.5 L4 20 L8.6 15.6 L11.6 22 L14.6 20.6 L11.7 14.4 L18 14.4 Z" fill="#111827" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
    document.documentElement.appendChild(c);
    const d = document.createElement("div");
    d.id = "__drag";
    document.documentElement.appendChild(d);
    const last = JSON.parse(sessionStorage.getItem("__cursor") || "[960,540]");
    const place = (x, y) => {
      c.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
      d.style.left = x + 26 + "px";
      d.style.top = y + 22 + "px";
    };
    place(last[0], last[1]);
    document.addEventListener("mousemove", (e) => {
      place(e.clientX, e.clientY);
      sessionStorage.setItem("__cursor", JSON.stringify([e.clientX, e.clientY]));
    }, true);
    document.addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.className = "__ring";
      r.style.left = e.clientX + "px";
      r.style.top = e.clientY + "px";
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 800);
    }, true);
    window.__dragLabel = (text) => {
      d.textContent = text || "";
      d.style.display = text ? "block" : "none";
    };
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

// ---------- screencast capture ----------
class Recorder {
  constructor(page, cdp, name, scale) {
    Object.assign(this, { page, cdp, name, scale, frames: [], dir: path.join(TMP, "frames", name) });
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.handler = async (f) => {
      const file = path.join(this.dir, `f${String(this.frames.length).padStart(5, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(f.data, "base64"));
      this.frames.push({ file, t: f.metadata.timestamp });
      try {
        await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
      } catch {}
    };
  }
  async start() {
    this.cdp.on("Page.screencastFrame", this.handler);
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W * this.scale, maxHeight: H * this.scale, everyNthFrame: 1 });
    this.t0 = Date.now() / 1000;
  }
  async stop(holdMs = 400) {
    await sleep(holdMs);
    await this.cdp.send("Page.stopScreencast");
    this.cdp.off("Page.screencastFrame", this.handler);
    this.t1 = Date.now() / 1000;
  }
  /** Writes an ffmpeg concat list that keeps real timing between frames. */
  concatList() {
    const lines = [];
    const fr = this.frames;
    for (let i = 0; i < fr.length; i++) {
      const next = i + 1 < fr.length ? fr[i + 1].t : this.t1;
      lines.push(`file '${fr[i].file}'`, `duration ${Math.max(0.001, next - fr[i].t).toFixed(4)}`);
    }
    lines.push(`file '${fr[fr.length - 1].file}'`);
    const list = path.join(this.dir, "list.txt");
    fs.writeFileSync(list, lines.join("\n"));
    return list;
  }
}

function encode(list, out, vf) {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", `${vf},fps=30,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", "30", "-movflags", "+faststart", "-an", out]);
}

async function withPage(fn, { scale = 1, cursor = true } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  if (cursor) await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  try {
    return await fn(page, cdp);
  } finally {
    await browser.close();
  }
}

// ---------- human-like actions ----------
async function moveTo(page, x, y, steps = 28) {
  await page.mouse.move(x, y, { steps });
}
async function point(page, locator, steps = 28) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await moveTo(page, b.x + b.width / 2, b.y + b.height / 2, steps);
  return b;
}
async function click(page, locator) {
  await point(page, locator);
  await sleep(250);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(PAUSE);
}
async function typeInto(page, locator, text) {
  await click(page, locator);
  await locator.pressSequentially(text, { delay: 1000 / CPS });
  await sleep(PAUSE);
}
async function select(page, locator, value) {
  await point(page, locator);
  await sleep(300);
  await page.mouse.down();
  await page.mouse.up();
  await locator.selectOption(value);
  await sleep(PAUSE);
}
async function smoothScroll(page, y, ms = 900) {
  await page.evaluate(([to, dur]) => new Promise((done) => {
    const from = window.scrollY;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      window.scrollTo(0, from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }), [y, ms]);
  await sleep(300);
}
async function goto(page, url) {
  await page.goto(BASE + url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(500);
}

/** Records one scene. Scenes with `close` are recorded a second time with the page zoomed in around `body.focus`. */
async function scene(id, name, body, { close = null } = {}) {
  console.log(`> ${id} ${name}`);
  const pass = (zoomed) =>
    withPage(async (page, cdp) => {
      await body.setup?.(page);
      if (zoomed) {
        const b = await body.focus(page).boundingBox();
        const pad = close.pad ?? 50;
        let cw = Math.min(W, Math.max(b.width + pad * 2, ((b.height + pad * 2) * 16) / 9, close.minWidth ?? 900));
        const ch = (cw * 9) / 16;
        const cx = Math.min(Math.max(b.x + b.width / 2 - cw / 2, 0), W - cw);
        const cy = Math.min(Math.max(b.y + b.height / 2 - ch / 2, 70), H - ch);
        const z = W / cw;
        await page.evaluate(([cx, cy, z]) => {
          document.body.style.transformOrigin = "0 0";
          document.body.style.transform = `translate(${-cx * z}px, ${-cy * z}px) scale(${z})`;
          document.querySelectorAll(".topbar, .viewer").forEach((el) => (el.style.position = "relative"));
        }, [cx, cy, z]);
        await sleep(600);
      }
      const rec = new Recorder(page, cdp, id + (zoomed ? "_close" : ""), 1);
      await rec.start();
      await body.run(page);
      await rec.stop(body.hold ?? 600);
      encode(rec.concatList(), path.join(CLIPS, `${id}_${name}${zoomed ? "_close" : ""}.mp4`), `scale=${W}:${H}:flags=lanczos`);
    });
  await pass(false);
  if (close) await pass(true);
}

/** Records an HTML card or prompt replay for a fixed time and saves a PNG still of the last frame. */
async function htmlClip(id, name, file, ms, bg = "#ffffff") {
  console.log(`> ${id} ${name}`);
  return withPage(async (page, cdp) => {
    const rec = new Recorder(page, cdp, id, 1);
    await page.setContent(`<body style="margin:0;background:${bg};width:100vw;height:100vh"></body>`);
    await rec.start();
    await page.goto("file://" + file, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await sleep(ms);
    await page.screenshot({ path: path.join(CLIPS, `${id}_${name}.png`) });
    await rec.stop(100);
    encode(rec.concatList(), path.join(CLIPS, `${id}_${name}.mp4`), `scale=${W}:${H}:flags=lanczos`);
  }, { cursor: false });
}

// ---------- scenes ----------
const SAMPLE_DIR = path.join(ROOT, "samples", "invoices");

async function dropFiles(page, selector, files) {
  const payload = files.map((f) => ({ name: path.basename(f), type: f.endsWith(".pdf") ? "application/pdf" : "image/jpeg", b64: fs.readFileSync(f).toString("base64") }));
  await page.evaluate(([sel, items]) => {
    const dt = new DataTransfer();
    for (const it of items) {
      const bin = Uint8Array.from(atob(it.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bin], it.name, { type: it.type }));
    }
    const el = document.querySelector(sel);
    el.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, [selector, payload]);
}

const sampleFiles = () => fs.readdirSync(SAMPLE_DIR).sort().map((f) => path.join(SAMPLE_DIR, f));

const SCENES = {
  K01: () => htmlClip("K01", "problem", path.join(CLIPS, "cards", "K01.html"), 5600),
  P01: () => htmlClip("P01", "build_prompt", path.join(CLIPS, "prompts", "terminal.html") + "?s=P01", 10500, "#0b1220"),
  C01: async () => {
    await freshApp(true);
    await scene("C01", "upload", {
      setup: async (page) => {
        await goto(page, "/?pace=110");
        await page.mouse.move(1500, 860);
      },
      run: async (page) => {
        await sleep(500);
        await page.evaluate(() => window.__dragLabel("40 invoices (PDF and photos)"));
        const zone = page.getByTestId("upload-zone");
        await point(page, zone, 45);
        await page.evaluate(() => document.querySelector('[data-testid="upload-zone"]').classList.add("drag"));
        await sleep(700);
        await page.mouse.down();
        await page.mouse.up();
        await page.evaluate(() => window.__dragLabel(""));
        await dropFiles(page, '[data-testid="upload-zone"]', sampleFiles());
        await page.mouse.move(1650, 700, { steps: 30 });
        await sleep(5200);
      },
      hold: 300,
    });
  },
  C02: async () => {
    await freshApp(true);
    await scene("C02", "board", {
      setup: async (page) => {
        await goto(page, "/?pace=150");
        await page.mouse.move(1700, 200);
      },
      run: async (page) => {
        await sleep(400);
        await page.getByTestId("upload-input").setInputFiles(sampleFiles());
        await page.getByTestId("upload-zone").getByText(/40 processed/).waitFor({ timeout: 60000 });
        await sleep(800);
        await point(page, page.getByTestId("col-blocked").locator(".col-head"), 30);
        await sleep(600);
        await point(page, page.getByTestId("col-errors").locator(".col-head"), 25);
        await sleep(600);
        await point(page, page.getByTestId("col-review").locator(".col-head"), 35);
        await sleep(900);
      },
      hold: 300,
    });
  },
  C03: async () => {
    await freshApp(false);
    await scene("C03", "invoice_detail", {
      setup: async (page) => {
        await goto(page, "/");
        await page.mouse.move(900, 600);
      },
      run: async (page) => {
        await sleep(300);
        await click(page, page.getByTestId("card-10"));
        await page.getByTestId("invoice-file").locator("canvas").first().waitFor();
        await sleep(1200);
        await point(page, page.getByTestId("field-vendor_name"), 30);
        await sleep(500);
        await point(page, page.getByTestId("field-total").locator(".conf"), 30);
        await sleep(700);
        await point(page, page.getByTestId("field-due_date").locator(".model-tag"), 30);
        await sleep(1600);
        await smoothScroll(page, 560, 1300);
        await point(page, page.getByTestId("checks"), 30);
        await sleep(1200);
      },
    });
  },
  C04: async () => {
    await ensureApp();
    await scene("C04", "duplicate_blocked", {
      setup: async (page) => {
        await goto(page, "/invoices/34");
        await page.getByTestId("invoice-file").locator("canvas").first().waitFor();
        await page.mouse.move(1400, 900);
      },
      focus: (page) => page.getByTestId("flag-duplicate_invoice_number"),
      run: async (page) => {
        await sleep(500);
        const flag = page.getByTestId("flag-duplicate_invoice_number");
        await point(page, flag.locator(".flag-title"), 35);
        await sleep(1100);
        await point(page, flag.getByRole("link"), 25);
        await sleep(2200);
      },
    }, { close: { pad: 40, minWidth: 820 } });
  },
  C05: async () => {
    await ensureApp();
    await scene("C05", "maths_error", {
      setup: async (page) => {
        await goto(page, "/invoices/25");
        await page.getByTestId("invoice-file").locator("canvas").first().waitFor();
        await page.mouse.move(1400, 900);
      },
      focus: (page) => page.getByTestId("flag-subtotal_mismatch"),
      run: async (page) => {
        await sleep(400);
        const flag = page.getByTestId("flag-subtotal_mismatch");
        await point(page, flag.locator(".flag-title"), 35);
        await sleep(1000);
        await point(page, flag, 25);
        await sleep(1800);
      },
    }, { close: { pad: 40, minWidth: 820 } });
  },
  K02: () => htmlClip("K02", "flow", path.join(CLIPS, "cards", "K02.html"), 7200),
  C06: async () => {
    await ensureApp();
    await scene("C06", "manager_approves", {
      setup: async (page) => {
        await goto(page, "/invoices/20");
        await page.getByTestId("invoice-file").locator("canvas").first().waitFor();
        await page.mouse.move(1300, 500);
      },
      run: async (page) => {
        await sleep(400);
        await point(page, page.getByTestId("route-reasons"), 30);
        await sleep(900);
        await select(page, page.getByTestId("actor"), "finance.manager");
        await page.getByTestId("approve-btn").waitFor();
        await sleep(400);
        await typeInto(page, page.getByTestId("approve-reason"), "Laptops for new starters, matches PO-3003");
        await click(page, page.getByTestId("approve-btn"));
        await page.getByTestId("status").getByText("Posted").waitFor();
        await sleep(600);
        await moveTo(page, 820, 140, 30);
        await sleep(1600);
      },
    });
  },
  P02: () => htmlClip("P02", "rule_prompt", path.join(CLIPS, "prompts", "terminal.html") + "?s=P02", 9000, "#0b1220"),
  C07: async () => {
    await ensureApp();
    await scene("C07", "ledger_retry", {
      setup: async (page) => {
        await goto(page, "/ledger");
        await page.mouse.move(900, 700);
      },
      run: async (page) => {
        await sleep(400);
        await point(page, page.getByTestId("bill-20"), 30);
        await sleep(1000);
        await point(page, page.getByTestId("error-38"), 30);
        await sleep(600);
        await typeInto(page, page.getByTestId("retry-reason-38"), "System is back online");
        await click(page, page.getByTestId("retry-btn-38"));
        await page.getByTestId("bill-38").waitFor();
        await sleep(400);
        await point(page, page.getByTestId("bill-38"), 30);
        await sleep(1400);
      },
    });
  },
  C08: async () => {
    await ensureApp();
    await scene("C08", "dashboard_audit", {
      setup: async (page) => {
        await goto(page, "/dashboard");
        await page.mouse.move(900, 160);
      },
      run: async (page) => {
        await sleep(300);
        for (const i of [0, 1, 3, 5]) {
          await point(page, page.getByTestId("kpis").locator(".kpi").nth(i), 18);
          await sleep(450);
        }
        await goto(page, "/invoices/20");
        await smoothScroll(page, 1500, 1400);
        await point(page, page.getByTestId("audit").locator("li").last(), 25);
        await sleep(1500);
      },
    });
  },
  K03: () => htmlClip("K03", "safeguards", path.join(CLIPS, "cards", "K03.html"), 6400),
  K04: () => htmlClip("K04", "offer", path.join(CLIPS, "cards", "K04.html"), 6600),
};

async function main() {
  const wanted = process.argv.slice(2);
  const ids = wanted.length ? wanted : Object.keys(SCENES);
  fs.mkdirSync(TMP, { recursive: true });
  try {
    for (const id of ids) await SCENES[id]();
  } finally {
    stopServer();
  }
}
main().catch((e) => {
  stopServer();
  console.error(e);
  process.exit(1);
});
