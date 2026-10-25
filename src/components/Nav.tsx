"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Invoices" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/blocked", label: "Blocked today" },
  { href: "/ledger", label: "Ledger and errors" },
  { href: "/rules", label: "Approval rules" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={(l.href === "/" ? path === "/" || path.startsWith("/invoices") : path.startsWith(l.href)) ? "active" : ""}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
