import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ActorSwitcher } from "@/components/ActorSwitcher";
import { currentActor } from "@/lib/actor";
import { config } from "@/lib/config";

export const metadata: Metadata = {
  title: "Invoice Approval Agent",
  description: "Reads invoices, checks the maths, blocks duplicates, routes approvals and posts approved bills.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  const demo = config().demoMode;
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="logo">
              <div className="logo-mark">IA</div>
              Invoice Agent
            </div>
            <Nav />
            {demo ? <span className="demo-badge" title="Sample data and recorded AI responses. No API keys needed.">Demo mode</span> : null}
            <ActorSwitcher current={actor.id} />
          </div>
        </header>
        <main className="page">{children}</main>
      </body>
    </html>
  );
}
