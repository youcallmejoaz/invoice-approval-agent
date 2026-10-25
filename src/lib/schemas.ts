import { z } from "zod";

/** A value read by the model plus how sure it is (0 to 1). */
const field = <T extends z.ZodType>(value: T) =>
  z.object({
    value: value.nullable(),
    confidence: z.number().min(0).max(1),
  });

export const LineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  amount: z.number(),
});

/** Structured output the model must return for one invoice. Numbers are as printed; code does the maths. */
export const ExtractionSchema = z.object({
  vendor_name: field(z.string()),
  invoice_number: field(z.string()),
  invoice_date: field(z.string().describe("YYYY-MM-DD")),
  due_date: field(z.string().describe("YYYY-MM-DD")),
  currency: field(z.string().describe("ISO 4217 code, e.g. USD")),
  po_number: field(z.string()),
  subtotal: field(z.number()),
  tax_rate: field(z.number().describe("percent, e.g. 8 for 8%")),
  tax: field(z.number()),
  total: field(z.number()),
  line_items: field(z.array(LineItemSchema)),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type FieldName = keyof Extraction;
export const FIELD_NAMES = Object.keys(ExtractionSchema.shape) as FieldName[];

export const FIELD_LABELS: Record<FieldName, string> = {
  vendor_name: "Vendor",
  invoice_number: "Invoice number",
  invoice_date: "Invoice date",
  due_date: "Due date",
  currency: "Currency",
  po_number: "PO number",
  subtotal: "Subtotal",
  tax_rate: "Tax rate",
  tax: "Tax",
  total: "Total",
  line_items: "Line items",
};

/** Fields that must be read clearly before an invoice can be approved. po_number is optional. */
export const REQUIRED_FIELDS: FieldName[] = [
  "vendor_name",
  "invoice_number",
  "invoice_date",
  "due_date",
  "currency",
  "subtotal",
  "tax",
  "total",
  "line_items",
];

/** Which model produced each field's final value, and whether it is still unclear. */
export type FieldSource = { model: "fast" | "check" | "person" | "none"; unclear: boolean; firstConfidence: number };

export type ExtractionResult = {
  extraction: Extraction;
  sources: Record<FieldName, FieldSource>;
  modelsUsed: string[];
  mode: "demo" | "live";
  note?: string;
};

export type Severity = "error" | "warning";
export type Flag = {
  code: string;
  severity: Severity;
  message: string;
  relatedInvoiceId?: number;
};

export type Route = "auto" | "review" | "manager" | "blocked";
export type InvoiceStatus =
  | "needs_review"
  | "awaiting_manager"
  | "approved"
  | "posted"
  | "post_failed"
  | "blocked"
  | "rejected";

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  needs_review: "Needs review",
  awaiting_manager: "Waiting for manager",
  approved: "Approved",
  posted: "Posted",
  post_failed: "Posting failed",
  blocked: "Blocked",
  rejected: "Rejected",
};

export const ACTORS = {
  system: { id: "system", label: "System", role: "system" },
  "ap.clerk": { id: "ap.clerk", label: "AP Clerk", role: "clerk" },
  "finance.manager": { id: "finance.manager", label: "Finance Manager", role: "manager" },
} as const;
export type ActorId = keyof typeof ACTORS;
export const PERSON_ACTORS: ActorId[] = ["ap.clerk", "finance.manager"];
