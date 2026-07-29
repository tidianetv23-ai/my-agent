import Dashboard from "./Dashboard";
import {
  isGoogleConnected,
  getAuthedClient,
  getTodayEvents,
  getRecentImportantEmails,
  type CalEvent,
  type EmailItem,
} from "@/lib/google";
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

  // Agenda + mails du jour — seulement si Google est connecte.
  // En cas d'echec Gmail/Agenda, on renvoie des listes vides plutot que
  // de casser la page.
  let events: CalEvent[] = [];
  let emails: EmailItem[] = [];
  if (connected) {
    try {
      const auth = await getAuthedClient();
      [events, emails] = await Promise.all([
        getTodayEvents(auth, TIMEZONE()),
        getRecentImportantEmails(auth),
      ]);
    } catch {
      events = [];
      emails = [];
    }
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
      events={events}
      emails={emails}
    />
  );
}
