/** Prints every invoice blocked today and why. */
import { blockedToday } from "../src/lib/dashboard";
import { formatMoney } from "../src/lib/money";

const rows = blockedToday();
console.log(`${rows.length} invoice(s) blocked today\n`);
for (const inv of rows) {
  console.log(`#${inv.id}  ${inv.vendor_name}  ${inv.invoice_number}  ${formatMoney(inv.total_cents, inv.currency ?? "USD")}  (${inv.file_name}, by ${inv.source})`);
  console.log(`     ${inv.flags.find((f) => f.code.startsWith("duplicate"))?.message ?? inv.reasons.map((r) => r.message).join(" ")}\n`);
}
