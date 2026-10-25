import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { logAudit } from "./audit";
import { db, nowIso } from "./db";
import { BLOCKING_DUPLICATE_CODES } from "./duplicates";
import { formatMoney, toCents } from "./money";
import type { Flag, Route } from "./schemas";
import type { RouteReason } from "./repo";

export const RULE_KINDS = {
  amount_over: "Total is over an amount",
  new_vendor: "Vendor is not in the vendor list",
  low_confidence: "AI was not sure about a field",
  validation_failed: "A check failed (maths, dates, PO)",
  possible_duplicate: "Looks like a duplicate",
  vendor_is: "Vendor is a specific vendor",
} as const;
export type RuleKind = keyof typeof RULE_KINDS;

export const RuleInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(3),
  kind: z.enum(Object.keys(RULE_KINDS) as [RuleKind, ...RuleKind[]]),
  params: z.object({ amount: z.number().positive().optional(), vendor: z.string().optional() }).default({}),
  route: z.enum(["review", "manager"]),
  priority: z.number().int().default(100),
  description: z.string().default(""),
});
export type RuleInput = z.input<typeof RuleInputSchema>;

export type Rule = {
  id: string;
  name: string;
  kind: RuleKind;
  params: { amount?: number; vendor?: string };
  route: "review" | "manager";
  enabled: boolean;
  priority: number;
  description: string;
  created_by: string;
  created_at: string;
};

type RuleRow = Omit<Rule, "params" | "enabled"> & { params_json: string; enabled: number };

export function listRules(): Rule[] {
  return (db().prepare("SELECT * FROM rules ORDER BY priority, created_at").all() as RuleRow[]).map((r) => ({
    ...r,
    params: JSON.parse(r.params_json),
    enabled: r.enabled === 1,
  }));
}

export function addRule(input: RuleInput, actor: string, reason: string): Rule {
  if (!reason || reason.trim().length < 3) throw new Error("A reason is required to change the rules.");
  const r = RuleInputSchema.parse(input);
  if (r.kind === "amount_over" && !r.params.amount) throw new Error("An amount is required for this rule.");
  if (r.kind === "vendor_is" && !r.params.vendor) throw new Error("A vendor name is required for this rule.");
  const id = r.id ?? `${r.kind.replace(/_/g, "-")}-${r.route}-${Date.now().toString(36)}`;
  db()
    .prepare(
      `INSERT INTO rules (id, name, kind, params_json, route, enabled, priority, description, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(id, r.name, r.kind, JSON.stringify(r.params), r.route, r.priority, r.description, actor, nowIso());
  logAudit({ actor, action: "rule_added", detail: `Rule "${r.name}": ${RULE_KINDS[r.kind]} -> ${r.route === "manager" ? "finance manager" : "review"}`, reason });
  return listRules().find((x) => x.id === id)!;
}

export function setRuleEnabled(id: string, enabled: boolean, actor: string, reason: string) {
  if (!reason || reason.trim().length < 3) throw new Error("A reason is required to change the rules.");
  const rule = listRules().find((r) => r.id === id);
  if (!rule) throw new Error("Rule not found.");
  db().prepare("UPDATE rules SET enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
  logAudit({ actor, action: enabled ? "rule_enabled" : "rule_disabled", detail: `Rule "${rule.name}"`, reason });
}

export function loadDefaultRules(file = path.join(process.cwd(), "config", "rules.json")) {
  const { rules } = JSON.parse(fs.readFileSync(file, "utf8")) as { rules: RuleInput[] };
  const insert = db().prepare(
    `INSERT OR REPLACE INTO rules (id, name, kind, params_json, route, enabled, priority, description, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'system', ?)`,
  );
  for (const input of rules) {
    const r = RuleInputSchema.parse(input);
    insert.run(r.id, r.name, r.kind, JSON.stringify(r.params), r.route, r.priority, r.description, nowIso());
  }
}

export type RouteContext = {
  flags: Flag[];
  totalCents: number | null;
  vendorName: string | null;
  currency: string | null;
};

const STRICTNESS: Record<Route, number> = { auto: 0, review: 1, manager: 2, blocked: 3 };

function matches(rule: Rule, ctx: RouteContext): boolean {
  const has = (code: string) => ctx.flags.some((f) => f.code === code);
  switch (rule.kind) {
    case "amount_over":
      return ctx.totalCents !== null && rule.params.amount !== undefined && ctx.totalCents > toCents(rule.params.amount)!;
    case "new_vendor":
      return has("new_vendor");
    case "low_confidence":
      return has("low_confidence");
    case "validation_failed":
      return ctx.flags.some((f) => f.severity === "error" && f.code !== "low_confidence");
    case "possible_duplicate":
      return has("possible_duplicate");
    case "vendor_is":
      return !!ctx.vendorName && !!rule.params.vendor && ctx.vendorName.toLowerCase().includes(rule.params.vendor.toLowerCase());
  }
}

/**
 * Decides where an invoice goes. Rules are data; the strictest matching rule wins.
 * Built-in safety, independent of the rules table: exact duplicates are blocked, and any failed check,
 * unclear field or new vendor always goes to a person, even if the matching rule is turned off.
 */
export function decideRoute(ctx: RouteContext, rules: Rule[] = listRules()): { route: Route; reasons: RouteReason[] } {
  const dup = ctx.flags.find((f) => BLOCKING_DUPLICATE_CODES.includes(f.code));
  if (dup) return { route: "blocked", reasons: [{ ruleId: "builtin-duplicate", name: "Duplicate blocked", message: dup.message }] };

  let route: Route = "auto";
  const reasons: RouteReason[] = [];
  for (const rule of rules.filter((r) => r.enabled)) {
    if (!matches(rule, ctx)) continue;
    if (STRICTNESS[rule.route] > STRICTNESS[route]) route = rule.route;
    const detail =
      rule.kind === "amount_over" && ctx.totalCents !== null
        ? `Total ${formatMoney(ctx.totalCents, ctx.currency ?? "USD")} is over ${formatMoney(toCents(rule.params.amount!)!, ctx.currency ?? "USD")}.`
        : rule.description;
    reasons.push({ ruleId: rule.id, name: rule.name, message: `${detail} Goes to ${rule.route === "manager" ? "a finance manager" : "review"}.` });
  }

  const needsPerson = ctx.flags.some((f) => f.severity === "error" || f.code === "new_vendor" || f.code === "possible_duplicate");
  if (needsPerson && route === "auto") {
    route = "review";
    reasons.push({ ruleId: "builtin-safety", name: "Built-in safety", message: "A check needs a person, so this cannot be approved automatically." });
  }

  if (route === "auto") {
    const limit = rules.find((r) => r.enabled && r.kind === "amount_over" && r.params.amount !== undefined);
    reasons.push({
      ruleId: "auto",
      name: "Auto-approved",
      message: limit
        ? `Under ${formatMoney(toCents(limit.params.amount!)!, ctx.currency ?? "USD")}, known vendor, and every check passed.`
        : "Known vendor and every check passed.",
    });
  }
  return { route, reasons };
}
