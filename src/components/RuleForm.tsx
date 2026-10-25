"use client";

import { useActionState, useState } from "react";
import { addRuleAction, toggleRuleAction, type ActionState } from "@/app/actions";

export function RuleForm({ kinds }: { kinds: Record<string, string> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addRuleAction, null);
  const [kind, setKind] = useState("new_vendor");
  return (
    <form action={action} className="form" data-testid="rule-form">
      <label htmlFor="r-name">Rule name</label>
      <input id="r-name" name="name" required minLength={3} placeholder="For example: New vendor needs manager" />
      <label htmlFor="r-kind">When</label>
      <select id="r-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.entries(kinds).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {kind === "amount_over" ? (
        <>
          <label htmlFor="r-amount">Amount (USD)</label>
          <input id="r-amount" name="amount" type="number" min="1" step="0.01" required />
        </>
      ) : null}
      {kind === "vendor_is" ? (
        <>
          <label htmlFor="r-vendor">Vendor name contains</label>
          <input id="r-vendor" name="vendor" required />
        </>
      ) : null}
      <label htmlFor="r-route">Send to</label>
      <select id="r-route" name="route" defaultValue="manager">
        <option value="manager">Finance manager</option>
        <option value="review">Review (any approver)</option>
      </select>
      <label htmlFor="r-desc">Description</label>
      <input id="r-desc" name="description" placeholder="Shown as the reason on each invoice" />
      <label htmlFor="r-reason">Reason for adding this rule (required)</label>
      <input id="r-reason" name="reason" required minLength={3} />
      <div style={{ marginTop: 14 }}>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Adding..." : "Add rule"}
        </button>
      </div>
      {state ? <div className={state.ok ? "ok-msg" : "error-msg"}>{state.message}</div> : null}
    </form>
  );
}

export function RuleToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleRuleAction, null);
  return (
    <form action={action} className="inline-form switch">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="enabled" value={enabled ? "0" : "1"} />
      <input name="reason" required minLength={3} placeholder="Reason" aria-label="Reason" style={{ minWidth: 140 }} />
      <button className="btn" disabled={pending}>
        {enabled ? "Turn off" : "Turn on"}
      </button>
      {state && !state.ok ? <span className="error-msg">{state.message}</span> : null}
    </form>
  );
}
