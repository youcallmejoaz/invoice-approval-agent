import { cookies } from "next/headers";
import { ACTORS, PERSON_ACTORS, type ActorId } from "./schemas";

/** Demo stand-in for login: who the person using the app is acting as (AP Clerk or Finance Manager). */
export async function currentActor(): Promise<(typeof ACTORS)[ActorId]> {
  const id = (await cookies()).get("actor")?.value as ActorId | undefined;
  return id && PERSON_ACTORS.includes(id) ? ACTORS[id] : ACTORS["ap.clerk"];
}
