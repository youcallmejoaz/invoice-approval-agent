/** Watches the incoming folder and the mock email inbox, processing new invoices as they arrive. */
import { config } from "../src/lib/config";
import { processFolder } from "../src/lib/intake/folder";
import { processInbox } from "../src/lib/intake/inbox";

const cfg = config();
console.log(`[intake] watching ${cfg.incomingDir} and inbox ${cfg.inboxDir} every ${cfg.intakePollMs} ms (demo mode: ${cfg.demoMode ? "on" : "off"})`);

let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const a = await processFolder(cfg.incomingDir);
    const b = await processInbox(cfg.inboxDir);
    if (a + b) console.log(`[intake] processed ${a} file(s) from the folder and ${b} email attachment(s)`);
  } catch (e) {
    console.error("[intake]", e);
  } finally {
    busy = false;
  }
}
setInterval(tick, cfg.intakePollMs);
void tick();
