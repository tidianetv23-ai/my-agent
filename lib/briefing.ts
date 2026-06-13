import {
  getAuthedClient,
  getTodayEvents,
  getRecentImportantEmails,
  getAccountEmail,
  sendEmail,
} from "./google";
import { generateBriefing } from "./claude";
import { db } from "./supabase";
import { TIMEZONE } from "./env";
import { getGoals, getHabitsWithLogs } from "./store";
import { renderBriefingHtml } from "./email-template";
import type { BriefingContent } from "./types";

export type BriefingResult = {
  id: number;
  date: string;
  content: BriefingContent;
  emailedTo: string | null;
};

// Coeur de l'agent : lit le contexte, genere le briefing, le stocke et l'envoie.
export async function runDailyBriefing(): Promise<BriefingResult> {
  const tz = TIMEZONE();
  const auth = await getAuthedClient();
  const dateLabel = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: tz,
  }).format(new Date());

  const [events, emails, goals, habits] = await Promise.all([
    getTodayEvents(auth, tz),
    getRecentImportantEmails(auth),
    getGoals(),
    getHabitsWithLogs(),
  ]);

  const content = await generateBriefing({
    events,
    emails,
    goals,
    habits,
    tz,
    dateLabel,
  });

  const { data, error } = await db()
    .from("briefings")
    .insert({ date_label: dateLabel, content })
    .select()
    .single();
  if (error) throw new Error(`Sauvegarde du briefing: ${error.message}`);

  let emailedTo: string | null = null;
  try {
    const recipient =
      process.env.BRIEFING_RECIPIENT || (await getAccountEmail(auth));
    if (recipient) {
      await sendEmail(
        auth,
        recipient,
        `Ton briefing — ${dateLabel}`,
        renderBriefingHtml(content, dateLabel)
      );
      emailedTo = recipient;
    }
  } catch (e) {
    console.error("Envoi de l'email echoue:", e);
  }

  return { id: data.id, date: dateLabel, content, emailedTo };
}
