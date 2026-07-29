"use server";
import { revalidatePath } from "next/cache";
import {
  addGoal,
  deleteGoal,
  addHabit,
  deleteHabit,
  toggleHabitLog,
} from "@/lib/store";
import { runDailyBriefing } from "@/lib/briefing";
import { draftEmailReply } from "@/lib/claude";
import { getAuthedClient, sendEmail } from "@/lib/google";
import { TIMEZONE } from "@/lib/env";

function todayInTz(): string {
  // "YYYY-MM-DD" dans le fuseau configure
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE() }).format(
    new Date()
  );
}

// Extrait l'adresse depuis un champ "Nom <email@x.com>"
function extractEmail(s: string): string {
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

export async function createGoal(title: string, detail: string) {
  if (!title.trim()) return;
  await addGoal(title.trim(), detail.trim());
  revalidatePath("/");
}
export async function removeGoal(id: number) {
  await deleteGoal(id);
  revalidatePath("/");
}
export async function createHabit(name: string, cadence: string) {
  if (!name.trim()) return;
  await addHabit(name.trim(), cadence);
  revalidatePath("/");
}
export async function removeHabit(id: number) {
  await deleteHabit(id);
  revalidatePath("/");
}
export async function toggleHabit(id: number) {
  await toggleHabitLog(id, todayInTz());
  revalidatePath("/");
}
export async function runBriefingNow() {
  const res = await runDailyBriefing();
  revalidatePath("/");
  return res;
}

// --- Reponse aux mails ---

// Genere un brouillon de reponse (ne l'envoie PAS)
export async function draftReply(input: {
  from: string;
  subject: string;
  snippet: string;
}): Promise<string> {
  return await draftEmailReply(input);
}

// Envoie la reponse, apres validation de Dierry
export async function sendReply(
  rawFrom: string,
  subject: string,
  body: string
): Promise<{ to: string }> {
  const to = extractEmail(rawFrom);
  if (!to) throw new Error("Adresse du destinataire introuvable.");
  if (!body.trim()) throw new Error("Le message est vide.");
  const auth = await getAuthedClient();
  const html = body
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  const replySubject = /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
  await sendEmail(auth, to, replySubject, html);
  return { to };
}
