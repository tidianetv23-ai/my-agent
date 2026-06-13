import Dashboard from "./Dashboard";
import { isGoogleConnected } from "@/lib/google";
import { getGoals, getHabitsWithLogs, getLatestBriefing } from "@/lib/store";
import { TIMEZONE } from "@/lib/env";
import type { Goal, HabitWithLogs } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Page() {
  let connected = false;
  let goals: Goal[] = [];
  let habits: HabitWithLogs[] = [];
  let briefing: any = null;
  let dbError: string | null = null;

  try {
    [connected, goals, habits, briefing] = await Promise.all([
      isGoogleConnected(),
      getGoals(),
      getHabitsWithLogs(),
      getLatestBriefing(),
    ]);
  } catch (e) {
    dbError = e instanceof Error ? e.message : "Erreur de connexion a la base.";
  }

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE(),
  }).format(new Date());

  return (
    <Dashboard
      connected={connected}
      goals={goals}
      habits={habits}
      briefing={briefing}
      today={today}
      dbError={dbError}
    />
  );
}
