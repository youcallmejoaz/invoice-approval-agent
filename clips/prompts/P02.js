// Output lines are the real output of: npm run rules:add -- --name "New vendor needs manager" --kind new_vendor --route manager
window.REPLAY = {
  prompt: "Add a rule: any new vendor always needs a manager's approval.",
  cps: 14,
  lineDelay: 300,
  lines: [
    { cls: "dim", html: "Adding a routing rule (rules are data, no code change)" },
    { cls: "ok", html: "Added rule \"New vendor needs manager\": Vendor is not in the vendor list -&gt; manager" },
    { html: " " },
    { cls: "dim", html: "Rules now:" },
    { html: "  on   Over the approval limit     Total is over an amount            -&gt; manager" },
    { cls: "hl", html: "  on   New vendor needs manager    Vendor is not in the vendor list   -&gt; manager" },
    { html: "  on   Failed checks               A check failed (maths, dates, PO)  -&gt; review" },
    { html: "  on   AI not sure                 AI was not sure about a field      -&gt; review" },
    { html: "  on   New vendor                  Vendor is not in the vendor list   -&gt; review" },
    { html: "  on   Possible duplicate          Looks like a duplicate             -&gt; review" },
  ],
};
