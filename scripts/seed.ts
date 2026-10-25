/**
 * npm run seed            reset data/, load master data and process the 40 sample invoices
 * npm run seed -- --empty reset and load master data only (empty board, for upload demos)
 */
import { closeDb, db } from "../src/lib/db";
import { config } from "../src/lib/config";
import { processSamples, resetAndLoadMasterData } from "../src/lib/seed";

async function main() {
  const empty = process.argv.includes("--empty");
  const cfg = config();
  console.log(`Seeding ${cfg.dbPath} (demo mode: ${cfg.demoMode ? "on" : "off"})`);
  resetAndLoadMasterData();
  if (!empty) {
    await processSamples((seq, file) => process.stdout.write(`  ${String(seq).padStart(2)} ${file}\n`));
    const rows = db().prepare("SELECT status, COUNT(*) AS n FROM invoices GROUP BY status ORDER BY status").all() as { status: string; n: number }[];
    console.log("Result: " + rows.map((r) => `${r.status} ${r.n}`).join(", "));
  } else console.log("Master data loaded. Board is empty.");
  closeDb();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
