import { FIELD_NAMES, type Extraction, type FieldName, type FieldSource } from "../schemas";

/**
 * Combines the fast model's read with the re-check model's read of the low-confidence fields.
 * A re-checked value replaces the first one only when the re-check is at least as confident.
 * Anything still under the threshold is marked unclear, which sends the invoice to a person.
 */
export function mergeExtraction(
  fast: Extraction,
  check: Partial<Extraction> | null,
  threshold: number,
): { extraction: Extraction; sources: Record<FieldName, FieldSource> } {
  const extraction = structuredClone(fast) as Extraction;
  const sources = {} as Record<FieldName, FieldSource>;
  for (const name of FIELD_NAMES) {
    const first = fast[name];
    let model: FieldSource["model"] = "fast";
    if (first.confidence < threshold && check && check[name]) {
      const second = check[name]!;
      if (second.confidence >= first.confidence) {
        (extraction as Record<FieldName, unknown>)[name] = second;
        model = "check";
      }
    }
    const final = extraction[name];
    sources[name] = {
      model,
      unclear: final.confidence < threshold && !(final.value === null && name === "po_number"),
      firstConfidence: first.confidence,
    };
  }
  return { extraction, sources };
}

/** Fields the fast model was unsure about, which the bigger model is asked to re-check. */
export function lowConfidenceFields(e: Extraction, threshold: number): FieldName[] {
  return FIELD_NAMES.filter((n) => e[n].confidence < threshold);
}

export function emptyExtraction(): Extraction {
  const e = {} as Record<FieldName, { value: null; confidence: number }>;
  for (const n of FIELD_NAMES) e[n] = { value: null, confidence: 0 };
  return e as unknown as Extraction;
}
