/**
 * Replaces the simulated demo fixtures with real model responses.
 * Needs ANTHROPIC_API_KEY. Costs roughly a cent or two per invoice (more when the re-check runs).
 *   ANTHROPIC_API_KEY=... npm run fixtures:record
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, FIXTURES_DIR, SAMPLES_DIR } from "../src/lib/config";
import { extractWithClaude } from "../src/lib/extract/claude";
import { lowConfidenceFields } from "../src/lib/extract/merge";
import { buildModelInput } from "../src/lib/extract/pdf";
import { mimeFor } from "../src/lib/pipeline";

async function main() {
  const cfg = config();
  if (!cfg.anthropicApiKey) throw new Error("Set ANTHROPIC_API_KEY to record real responses.");
  const dir = path.join(SAMPLES_DIR, "invoices");
  const done = new Set<string>();
  for (const file of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, file);
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    if (done.has(sha256)) continue;
    done.add(sha256);
    const input = await buildModelInput(full, mimeFor(file)!);
    const { fast, check, models } = await extractWithClaude(input, (e) => lowConfidenceFields(e, cfg.confidenceThreshold));
    fs.writeFileSync(
      path.join(FIXTURES_DIR, `${sha256}.json`),
      JSON.stringify({ file, sha256, simulated: false, recordedAt: new Date().toISOString(), models, responses: { fast, check } }, null, 2) + "\n",
    );
    console.log(`${file}: recorded (${models.join(" + ")})`);
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
