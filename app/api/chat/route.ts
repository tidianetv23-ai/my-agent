import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireEnv, ANTHROPIC_MODEL, TIMEZONE } from "@/lib/env";
import {
  getAuthedClient,
  getTodayEvents,
  getRecentImportantEmails,
} from "@/lib/google";
import { getGoals, getHabitsWithLogs, addGoal, addHabit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `Tu es l'assistant personnel de Dierry (entrepreneur : agence Instant-T, marque Maillot Addict ; etudiant ; sportif). Tu discutes avec lui en francais, au tutoiement, de facon concise et concrete.
Tu as des outils pour consulter ses vraies donnees (mails importants, agenda du jour, objectifs, habitudes) et pour ajouter un objectif ou une habitude.
Regles :
- Utilise les outils quand la question porte sur ses vraies donnees, plutot que d'inventer.
- N'invente jamais un mail, un rendez-vous, un objectif ou une habitude.
- N'ajoute un objectif/habitude que s'il le demande clairement, puis confirme ce que tu as ajoute.
- Tu ne peux pas envoyer d'email depuis le chat ; si on te le demande, dis-lui d'utiliser le bouton "Preparer une reponse" sur le mail concerne.
- Reste bref, va a l'essentiel.`;

// Les outils que l'IA peut appeler (typage souple pour rester compatible SDK)
const tools: any[] = [
  { name: "lire_mails", description: "Liste les mails importants non lus recents.", input_schema: { type: "object", properties: {} } },
  { name: "lire_agenda", description: "Liste les evenements de l'agenda d'aujourd'hui.", input_schema: { type: "object", properties: {} } },
  { name: "lister_objectifs", description: "Liste les objectifs actuels de Dierry.", input_schema: { type: "object", properties: {} } },
  { name: "lister_habitudes", description: "Liste les habitudes suivies et leur regularite.", input_schema: { type: "object", properties: {} } },
  {
    name: "ajouter_objectif",
    description: "Ajoute un nouvel objectif. Seulement si Dierry le demande.",
    input_schema: {
      type: "object",
      properties: {
        titre: { type: "string", description: "Titre de l'objectif" },
        detail: { type: "string", description: "Detail optionnel" },
      },
      required: ["titre"],
    },
  },
  {
    name: "ajouter_habitude",
    description: "Ajoute une nouvelle habitude. Seulement si Dierry le demande.",
    input_schema: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Nom de l'habitude" },
        cadence: { type: "string", enum: ["quotidienne", "hebdomadaire"], description: "Frequence" },
      },
      required: ["nom"],
    },
  },
];

async function runTool(
  name: string,
  input: any,
  tz: string
): Promise<{ result: string; mutated: boolean }> {
  try {
    switch (name) {
      case "lire_mails": {
        const auth = await getAuthedClient();
        return { result: JSON.stringify(await getRecentImportantEmails(auth)), mutated: false };
      }
      case "lire_agenda": {
        const auth = await getAuthedClient();
        return { result: JSON.stringify(await getTodayEvents(auth, tz)), mutated: false };
      }
      case "lister_objectifs": {
        return { result: JSON.stringify(await getGoals()), mutated: false };
      }
      case "lister_habitudes": {
        const habits = await getHabitsWithLogs();
        return {
          result: JSON.stringify(
            habits.map((h: any) => ({ nom: h.name, cadence: h.cadence, jours_faits_sur_7: h.done_last_7 }))
          ),
          mutated: false,
        };
      }
      case "ajouter_objectif": {
        const titre = String(input?.titre || "").trim();
        if (!titre) return { result: "Erreur : titre manquant.", mutated: false };
        await addGoal(titre, String(input?.detail || "").trim());
        return { result: `Objectif ajoute : ${titre}`, mutated: true };
      }
      case "ajouter_habitude": {
        const nom = String(input?.nom || "").trim();
        if (!nom) return { result: "Erreur : nom manquant.", mutated: false };
        const cadence = input?.cadence === "hebdomadaire" ? "hebdomadaire" : "quotidienne";
        await addHabit(nom, cadence);
        return { result: `Habitude ajoutee : ${nom} (${cadence})`, mutated: true };
      }
      default:
        return { result: "Outil inconnu.", mutated: false };
    }
  } catch (e) {
    return {
      result: `Erreur outil : ${e instanceof Error ? e.message : "inconnue"}`,
      mutated: false,
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const incoming: Array<{ role: "user" | "assistant"; content: string }> = Array.isArray(body?.messages)
      ? body.messages
      : [];
    const history = incoming
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-20);

    if (history.length === 0) {
      return NextResponse.json({ reply: "Dis-moi ce que tu veux savoir ou faire.", changed: false });
    }

    const tz = TIMEZONE();
    const client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
    const messages: any[] = history.map((m) => ({ role: m.role, content: m.content }));

    let changed = false;
    let reply = "";

    for (let step = 0; step < 6; step++) {
      const res = await client.messages.create({
        model: ANTHROPIC_MODEL(),
        max_tokens: 1024,
        system: SYSTEM,
        tools,
        messages,
      });

      if (res.stop_reason === "tool_use") {
        const toolResults: any[] = [];
        for (const block of res.content as any[]) {
          if (block.type === "tool_use") {
            const { result, mutated } = await runTool(block.name, block.input, tz);
            if (mutated) changed = true;
            toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
          }
        }
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: toolResults });
        continue;
      }

      reply = (res.content as any[])
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("\n")
        .trim();
      break;
    }

    if (!reply) reply = "Desole, je n'ai pas reussi a repondre. Reessaie.";
    return NextResponse.json({ reply, changed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
