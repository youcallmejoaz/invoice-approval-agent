"use client";

import { setActorAction } from "@/app/actions";

export function ActorSwitcher({ current }: { current: string }) {
  return (
    <form action={setActorAction} className="actor">
      <span>Acting as</span>
      <select name="actor" defaultValue={current} onChange={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Acting as" data-testid="actor">
        <option value="ap.clerk">AP Clerk</option>
        <option value="finance.manager">Finance Manager</option>
      </select>
    </form>
  );
}
