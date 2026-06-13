import Anthropic from "@anthropic-ai/sdk";
import { requireEnv, ANTHROPIC_MODEL } from "./env";
import type { CalEvent, EmailItem } from "./google";
import type { Goal, HabitWithLogs, BriefingContent } from "./types";

const SYSTEM = `Tu es l'assistant personnel de Dierry : entrepreneur (agence de com Instant-T, marque Maillot Addict), etudiant, et sportif. Il est organise, ambitieux et aime aller a l'essentiel.

Ta mission : produire un briefing matinal court, motivant et actionnable, en francais, au tutoiement.

Regles :
- Sois concret et priorise. Pas de blabla.
- Relie le plan de la journee aux rendez-vous reels et aux mails importants.
- Rappelle ses objectifs sans le culpabiliser ; encourage ses habitudes.
- Si l'agenda est vide, propose une structure de journee utile.

Tu reponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni backticks, suivant ce schema exact :
{
  "greeting": "phrase d'accueil chaleureuse, 1 ligne",
  "focus": "LA priorite du jour en une phrase",
  "plan": "plan de journee en markdown (titres ##, listes avec des tirets, creneaux horaires si pertinent)",
  "priorities": [{"title": "action ou mail a traiter", "why": "pourquoi c'est important"}],
  "goalReminders": ["rappel court lie a un objectif"],
  "habitNudges": ["encouragement court sur une habitude"]
}`;

export async function generateBriefing(input: {
  events: CalEvent[];
  emails: EmailItem[];
  goals: Goal[];
  habits: HabitWithLogs[];
  tz: string;
  dateLabel: string;
}): Promise<BriefingContent> {
  const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });

  const payload = {
    date: input.dateLabel,
    fuseau: input.tz,
    rendez_vous_du_jour: input.events,
    emails_non_lus_recents: input.emails,
    objectifs: input.goals.map((g) => ({ titre: g.title, detail: g.detail })),
    habitudes: input.habits.map((h) => ({
      nom: h.name,
      cadence: h.cadence,
      jours_faits_sur_7: h.done_last_7,
    })),
  };

  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL(),
    max_tokens: 1500,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Voici mon contexte du jour (JSON) :\n${JSON.stringify(
          payload,
          null,
          2
        )}\n\nGenere mon briefing du jour.`,
      },
    ],
  });

  const text = (msg.content as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n")
    .trim();

  const cleaned = text
    .replace(/^```json/i, "")
    .replace(/^```/, "")
    .replace(/```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as BriefingContent;
    return {
      greeting: parsed.greeting || "Bonjour Dierry,",
      focus: parsed.focus || "",
      plan: parsed.plan || "",
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
      goalReminders: Array.isArray(parsed.goalReminders)
        ? parsed.goalReminders
        : [],
      habitNudges: Array.isArray(parsed.habitNudges) ? parsed.habitNudges : [],
    };
  } catch {
    return {
      greeting: "Bonjour Dierry,",
      focus: "Avance sur ta priorite la plus importante aujourd'hui.",
      plan: text || "Pas de plan genere.",
      priorities: [],
      goalReminders: [],
      habitNudges: [],
    };
  }
}
