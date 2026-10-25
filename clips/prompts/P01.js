window.REPLAY = {
  prompt: "Build an invoice agent that reads invoices, checks the maths, blocks duplicates, routes approvals and posts approved bills to Zoho Books.",
  cps: 22,
  lineDelay: 330,
  lines: [
    { cls: "dim", html: "Plan" },
    { html: "1. Intake: upload, watched folder and email inbox (PDFs and photos)" },
    { html: "2. Read: Haiku extracts every field with a confidence score" },
    { html: "   Sonnet re-checks only the fields Haiku is unsure about" },
    { html: "3. Check in code: line items, subtotal, tax, total, dates, PO match" },
    { html: "4. Duplicates: same file or invoice number <span class='hl'>blocked</span>, look-alikes flagged" },
    { html: "5. Rules: small and clean <span class='ok'>auto-approved</span>, big ones to a manager" },
    { html: "6. Post approved bills to Zoho Books; failures go to a retry queue" },
    { html: "7. Dashboard and a full audit log: who, when and why" },
    { html: "8. Tests prove nothing posts without checks and approval" },
  ],
};
