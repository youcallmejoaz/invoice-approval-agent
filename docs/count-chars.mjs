// Counts characters for each Upwork portfolio field against Upwork's limits.
import fs from "node:fs";
const f = JSON.parse(fs.readFileSync(new URL("./portfolio-fields.json", import.meta.url), "utf8"));
const check = (label, text, limit) => console.log(`${label}: ${text.length}/${limit} ${text.length <= limit ? "OK" : "TOO LONG"}`);
f.titles.forEach((t, i) => check(`Title option ${i + 1}`, t, 70));
check("Role", f.role, 100);
check("Description", f.description, 600);
console.log(`Skills: ${f.skills.length}/5 ${f.skills.length === 5 ? "OK" : "WRONG COUNT"}`);
