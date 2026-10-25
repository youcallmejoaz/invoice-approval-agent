"use client";

import { useActionState } from "react";
import { retryAction, type ActionState } from "@/app/actions";

export function RetryForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(retryAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <div className="inline-form">
        <input name="reason" required minLength={3} placeholder="Reason for retrying (required)" aria-label="Reason for retrying" data-testid={`retry-reason-${id}`} />
        <button className="btn btn-primary" disabled={pending} data-testid={`retry-btn-${id}`}>
          {pending ? "Retrying..." : "Retry"}
        </button>
      </div>
      {state ? <div className={state.ok ? "ok-msg" : "error-msg"}>{state.message}</div> : null}
    </form>
  );
}
