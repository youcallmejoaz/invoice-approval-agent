"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { approveInvoice, editInvoice, rejectInvoice, retryPosting, type Edits } from "@/lib/approvals";
import { currentActor } from "@/lib/actor";
import { addRule, setRuleEnabled, type RuleKind } from "@/lib/rules";
import { PERSON_ACTORS, type ActorId } from "@/lib/schemas";

export type ActionState = { ok: boolean; message: string } | null;

const done = (message: string): ActionState => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};
const fail = (e: unknown): ActionState => ({ ok: false, message: (e as Error).message });

export async function setActorAction(formData: FormData) {
  const id = String(formData.get("actor")) as ActorId;
  if (PERSON_ACTORS.includes(id)) (await cookies()).set("actor", id, { path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function approveAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await currentActor();
    const r = await approveInvoice(Number(formData.get("id")), actor.id, String(formData.get("reason") ?? ""));
    return r.ok ? done(`Approved and posted as ${r.ref}.`) : { ok: false, message: `Approved, but posting failed: ${r.reason} It is in the error queue.` };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await currentActor();
    rejectInvoice(Number(formData.get("id")), actor.id, String(formData.get("reason") ?? ""));
    return done("Rejected.");
  } catch (e) {
    return fail(e);
  }
}

const EDIT_FIELDS = ["vendor_name", "invoice_number", "invoice_date", "due_date", "currency", "po_number", "subtotal", "tax_rate", "tax", "total", "line_items"];

export async function editAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await currentActor();
    const edits: Edits = {};
    for (const f of EDIT_FIELDS) {
      const v = formData.get(f);
      if (v !== null) (edits as Record<string, string>)[f] = String(v);
    }
    await editInvoice(Number(formData.get("id")), actor.id, edits, String(formData.get("reason") ?? ""));
    return done("Saved and checked again.");
  } catch (e) {
    return fail(e);
  }
}

export async function retryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await currentActor();
    const r = await retryPosting(Number(formData.get("id")), actor.id, String(formData.get("reason") ?? ""));
    return r.ok ? done(`Posted as ${r.ref}.`) : { ok: false, message: `Still failing: ${r.reason}` };
  } catch (e) {
    return fail(e);
  }
}

export async function addRuleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await currentActor();
    const kind = String(formData.get("kind")) as RuleKind;
    const amount = formData.get("amount") ? Number(formData.get("amount")) : undefined;
    const vendor = formData.get("vendor") ? String(formData.get("vendor")) : undefined;
    const rule = addRule(
      {
        name: String(formData.get("name") ?? ""),
        kind,
        params: { amount: kind === "amount_over" ? amount : undefined, vendor: kind === "vendor_is" ? vendor : undefined },
        route: String(formData.get("route")) as "review" | "manager",
        priority: 15,
        description: String(formData.get("description") ?? ""),
      },
      actor.id,
      String(formData.get("reason") ?? ""),
    );
    return done(`Rule "${rule.name}" added. It applies to new invoices from now on.`);
  } catch (e) {
    return fail(e);
  }
}

export async function toggleRuleAction(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const actor = await currentActor();
    setRuleEnabled(String(formData.get("id")), formData.get("enabled") === "1", actor.id, String(formData.get("reason") ?? ""));
    return done("Rule updated.");
  } catch (e) {
    return fail(e);
  }
}
