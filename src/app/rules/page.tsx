import { RuleForm, RuleToggle } from "@/components/RuleForm";
import { when } from "@/components/ui";
import { listRules, RULE_KINDS } from "@/lib/rules";
import { ACTORS, type ActorId } from "@/lib/schemas";

function condition(kind: keyof typeof RULE_KINDS, params: { amount?: number; vendor?: string }) {
  if (kind === "amount_over") return `Total is over $${params.amount?.toLocaleString("en-US")}`;
  if (kind === "vendor_is") return `Vendor name contains "${params.vendor}"`;
  return RULE_KINDS[kind];
}

export default function RulesPage() {
  const rules = listRules();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approval rules</h1>
          <p>Rules decide where each invoice goes. If no rule matches, the invoice is approved and posted automatically. When several match, the strictest wins.</p>
        </div>
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "1.6fr 1fr" }}>
        <div>
          <div className="card" data-testid="rules-list">
            <table className="table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>When</th>
                  <th>Send to</th>
                  <th>Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} data-testid={`rule-${r.id}`} style={r.enabled ? undefined : { opacity: 0.55 }}>
                    <td>
                      <strong>{r.name}</strong>
                      <div className="muted small">{r.description}</div>
                    </td>
                    <td>{condition(r.kind, r.params)}</td>
                    <td>
                      <span className={`pill ${r.route === "manager" ? "pill-violet" : "pill-amber"}`}>{r.route === "manager" ? "Finance manager" : "Review"}</span>
                    </td>
                    <td className="small">
                      {ACTORS[r.created_by as ActorId]?.label ?? r.created_by}
                      <div className="muted">{when(r.created_at)}</div>
                    </td>
                    <td>
                      <RuleToggle id={r.id} enabled={r.enabled} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="note section">
            <strong>Built-in safety, always on:</strong> exact duplicates are blocked, and any invoice with a failed check, a field the AI was not sure about, or a new vendor always goes to a person, even if its rule is turned off. Nothing is posted to accounting without passing every check and being approved.
          </div>
        </div>
        <div className="card card-pad">
          <h2>Add a rule</h2>
          <RuleForm kinds={RULE_KINDS} />
        </div>
      </div>
    </>
  );
}
