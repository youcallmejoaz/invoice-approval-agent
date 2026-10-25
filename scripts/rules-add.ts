/**
 * Adds a routing rule from the command line, e.g.
 * npm run rules:add -- --name "New vendor needs manager" --kind new_vendor --route manager --reason "Fraud control"
 */
import { addRule, listRules, RULE_KINDS, type RuleKind } from "../src/lib/rules";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const kind = arg("kind") as RuleKind;
if (!kind || !(kind in RULE_KINDS)) {
  console.error(`--kind must be one of: ${Object.keys(RULE_KINDS).join(", ")}`);
  process.exit(1);
}
const rule = addRule(
  {
    name: arg("name") ?? "",
    kind,
    params: { amount: arg("amount") ? Number(arg("amount")) : undefined, vendor: arg("vendor") },
    route: (arg("route") ?? "manager") as "review" | "manager",
    priority: Number(arg("priority") ?? 15),
    description: arg("description") ?? "",
  },
  arg("actor") ?? "finance.manager",
  arg("reason") ?? "",
);
console.log(`Added rule "${rule.name}" (${rule.id}): ${RULE_KINDS[rule.kind]} -> ${rule.route}`);
console.log("\nRules now:");
for (const r of listRules()) console.log(`  ${r.enabled ? "on " : "off"}  ${r.name.padEnd(30)} ${RULE_KINDS[r.kind].padEnd(36)} -> ${r.route}`);
