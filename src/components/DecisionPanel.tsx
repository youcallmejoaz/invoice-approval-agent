"use client";

import { useActionState, useState } from "react";
import { approveAction, editAction, rejectAction, type ActionState } from "@/app/actions";

type Field = { name: string; label: string; value: string; unclear: boolean };

export function DecisionPanel(props: {
  id: number;
  canApprove: boolean;
  approveBlockedReason: string | null;
  needsManager: boolean;
  actorIsManager: boolean;
  fields: Field[];
  linesText: string;
  editable: boolean;
}) {
  const [tab, setTab] = useState<"approve" | "reject" | "edit">(props.canApprove ? "approve" : props.editable && props.fields.some((f) => f.unclear) ? "edit" : "approve");
  const [approveState, approve, approving] = useActionState<ActionState, FormData>(approveAction, null);
  const [rejectState, reject, rejecting] = useActionState<ActionState, FormData>(rejectAction, null);
  const [editState, edit, editing] = useActionState<ActionState, FormData>(editAction, null);
  const managerBlock = props.needsManager && !props.actorIsManager;

  return (
    <div className="decision" data-testid="decision-panel">
      <div className="tabs">
        <button type="button" className={`tab${tab === "approve" ? " active" : ""}`} onClick={() => setTab("approve")}>
          Approve
        </button>
        <button type="button" className={`tab${tab === "reject" ? " active" : ""}`} onClick={() => setTab("reject")}>
          Reject
        </button>
        {props.editable ? (
          <button type="button" className={`tab${tab === "edit" ? " active" : ""}`} onClick={() => setTab("edit")}>
            Correct fields
          </button>
        ) : null}
      </div>

      {tab === "approve" ? (
        <form action={approve}>
          <input type="hidden" name="id" value={props.id} />
          {props.approveBlockedReason ? <div className="note">{props.approveBlockedReason}</div> : null}
          {managerBlock ? <div className="note">This invoice is over the approval limit. Switch to Finance Manager (top right) to approve it.</div> : null}
          <label htmlFor="approve-reason">Reason for approving (required)</label>
          <textarea id="approve-reason" name="reason" rows={2} required minLength={3} placeholder="For example: matches the purchase order and the delivery note" data-testid="approve-reason" />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-green" disabled={approving || !props.canApprove || managerBlock} data-testid="approve-btn">
              {approving ? "Approving..." : "Approve and post"}
            </button>
          </div>
          {approveState ? <div className={approveState.ok ? "ok-msg" : "error-msg"}>{approveState.message}</div> : null}
        </form>
      ) : null}

      {tab === "reject" ? (
        <form action={reject}>
          <input type="hidden" name="id" value={props.id} />
          <label htmlFor="reject-reason">Reason for rejecting (required)</label>
          <textarea id="reject-reason" name="reason" rows={2} required minLength={3} placeholder="For example: tax is wrong, asked the supplier for a corrected invoice" data-testid="reject-reason" />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-red" disabled={rejecting} data-testid="reject-btn">
              {rejecting ? "Rejecting..." : "Reject invoice"}
            </button>
          </div>
          {rejectState ? <div className={rejectState.ok ? "ok-msg" : "error-msg"}>{rejectState.message}</div> : null}
        </form>
      ) : null}

      {tab === "edit" && props.editable ? (
        <form action={edit}>
          <input type="hidden" name="id" value={props.id} />
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            Correct anything the AI misread, checking against the file on the left. Fields highlighted in orange were unclear; saving them counts as you confirming them. The invoice is checked again after saving.
          </p>
          <div className="edit-grid">
            {props.fields.map((f) => (
              <div key={f.name}>
                <label htmlFor={`f-${f.name}`} style={f.unclear ? { color: "var(--amber)" } : undefined}>
                  {f.label}
                  {f.unclear ? " (unclear)" : ""}
                </label>
                <input id={`f-${f.name}`} name={f.name} defaultValue={f.value} style={f.unclear ? { borderColor: "#f59e0b", background: "#fffbeb" } : undefined} data-testid={`edit-${f.name}`} />
              </div>
            ))}
          </div>
          <label htmlFor="f-lines">Line items (description | quantity | unit price | amount)</label>
          <textarea id="f-lines" name="line_items" rows={Math.max(2, props.linesText.split("\n").length)} defaultValue={props.linesText} />
          <label htmlFor="edit-reason">Reason for the change (required)</label>
          <textarea id="edit-reason" name="reason" rows={2} required minLength={3} placeholder="For example: total was hidden by a stain, checked it against the line items" data-testid="edit-reason" />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={editing} data-testid="edit-btn">
              {editing ? "Saving..." : "Save and check again"}
            </button>
          </div>
          {editState ? <div className={editState.ok ? "ok-msg" : "error-msg"}>{editState.message}</div> : null}
        </form>
      ) : null}
    </div>
  );
}
