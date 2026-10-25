import path from "node:path";

/** Runtime configuration, read from environment variables (see .env.example). */
export function config() {
  const dataDir = path.resolve(process.env.DATA_DIR || "./data");
  return {
    demoMode: process.env.DEMO_MODE !== "0",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
    modelFast: process.env.EXTRACT_MODEL_FAST || "claude-haiku-5-5",
    modelCheck: process.env.EXTRACT_MODEL_CHECK || "claude-sonnet-5-5",
    confidenceThreshold: Number(process.env.CONFIDENCE_THRESHOLD || "0.85"),
    dataDir,
    dbPath: process.env.DB_PATH || path.join(dataDir, "app.db"),
    filesDir: path.join(dataDir, "files"),
    incomingDir: path.join(dataDir, "incoming"),
    inboxDir: path.resolve(process.env.INBOX_DIR || path.join(dataDir, "inbox")),
    accountingAdapter: (process.env.ACCOUNTING_ADAPTER || "mock") as "mock" | "zoho" | "xero",
    intakePollMs: Number(process.env.INTAKE_POLL_MS || "2000"),
  };
}

export const ROOT = process.cwd();
export const FIXTURES_DIR = path.join(ROOT, "fixtures", "extractions");
export const SAMPLES_DIR = path.join(ROOT, "samples");
