import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config";
import { ExtractionSchema, FIELD_LABELS, type Extraction, type FieldName } from "../schemas";
import type { ModelInput } from "./pdf";

const SYSTEM = `You read supplier invoices for an accounts payable team.
Return every field exactly as printed on the invoice, with a confidence between 0 and 1 for how sure you are that you read that field correctly.
Use null when a field is not on the invoice or cannot be read at all, and give it a low confidence if it is present but unreadable.
Copy numbers as printed. Do not calculate, correct or fill in amounts: the accounts team checks the maths separately.
Dates must be YYYY-MM-DD. Currency must be an ISO 4217 code. tax_rate is the percent shown, for example 8 for 8%.`;

function contentFor(input: ModelInput): Anthropic.ContentBlockParam[] {
  if (input.kind === "image") {
    return [{ type: "image", source: { type: "base64", media_type: input.mediaType, data: input.base64 } }];
  }
  if (input.kind === "pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } }];
  }
  return [{ type: "text", text: `Invoice text (pages ${input.pagesSent.join(", ")}):\n\n${input.text}` }];
}

async function read(client: Anthropic, model: string, input: ModelInput, focus?: FieldName[]): Promise<Extraction> {
  const ask = focus
    ? `A first pass was unsure about these fields: ${focus.map((f) => FIELD_LABELS[f]).join(", ")}. Look at them again very carefully and return all fields. Be honest about confidence: if a value is still hard to read, keep the confidence low.`
    : "Extract the invoice fields.";
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: [...contentFor(input), { type: "text", text: ask }] }],
    output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined to read this file.");
  if (!response.parsed_output) throw new Error(`The model did not return valid invoice fields (stop reason: ${response.stop_reason}).`);
  return response.parsed_output;
}

/** Live mode: fast model reads every field; the bigger model re-checks only the fields under the threshold. */
export async function extractWithClaude(input: ModelInput, lowFields: (e: Extraction) => FieldName[]) {
  const cfg = config();
  if (!cfg.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY is not set. Set it or run with DEMO_MODE=1.");
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey });
  const fast = await read(client, cfg.modelFast, input);
  const focus = lowFields(fast);
  let check: Partial<Extraction> | null = null;
  if (focus.length > 0) {
    const second = await read(client, cfg.modelCheck, input, focus);
    check = Object.fromEntries(focus.map((f) => [f, second[f]])) as Partial<Extraction>;
  }
  return { fast, check, models: focus.length ? [cfg.modelFast, cfg.modelCheck] : [cfg.modelFast] };
}
