import { config } from "../config";
import type { ExtractionResult } from "../schemas";
import { loadFixture } from "./demo";
import { emptyExtraction, lowConfidenceFields, mergeExtraction } from "./merge";
import { buildModelInput } from "./pdf";

export async function extractInvoice(file: { path: string; mime: string; sha256: string }): Promise<ExtractionResult> {
  const cfg = config();
  const threshold = cfg.confidenceThreshold;

  if (cfg.demoMode) {
    const fixture = loadFixture(file.sha256);
    if (!fixture) {
      const { extraction, sources } = mergeExtraction(emptyExtraction(), null, threshold);
      return {
        extraction,
        sources,
        modelsUsed: [],
        mode: "demo",
        note: "Demo mode has no recorded AI response for this file, so nothing was guessed. A person needs to enter the fields.",
      };
    }
    const { fast, check } = fixture.responses;
    const { extraction, sources } = mergeExtraction(fast, check, threshold);
    return {
      extraction,
      sources,
      modelsUsed: check ? [cfg.modelFast, cfg.modelCheck] : [cfg.modelFast],
      mode: "demo",
      note: fixture.simulated ? "Demo mode: simulated AI response from fixtures." : "Demo mode: recorded AI response from fixtures.",
    };
  }

  const { extractWithClaude } = await import("./claude");
  const input = await buildModelInput(file.path, file.mime);
  const { fast, check, models } = await extractWithClaude(input, (e) => lowConfidenceFields(e, threshold));
  const { extraction, sources } = mergeExtraction(fast, check, threshold);
  return { extraction, sources, modelsUsed: models, mode: "live" };
}
