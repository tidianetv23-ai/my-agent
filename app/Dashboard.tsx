"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createGoal,
  removeGoal,
  createHabit,
  removeHabit,
  toggleHabit,
  runBriefingNow,
} from "./actions";

type Goal = { id: number; title: string; detail: string | null };
type Habit = {
  id: number;
  name: string;
  cadence: string;
  done_last_7: number;
  logged_days: string[];
};
type BriefingContent = {
  greeting: string;
  focus: string;
  plan: string;
  priorities: { title: string; why: string }[];
  goalReminders: string[];
  habitNudges: string[];
};
type Briefing = {
  date_label: string;
  content: BriefingContent;
  created_at: string;
} | null;

type Props = {
  connected: boolean;
  goals: Goal[];
  habits: Habit[];
  briefing: Briefing;
  today: string;
  dbError: string | null;
};

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon aprem";
  return "Bonsoir";
}

function PlanText({ md }: { md: string }) {
  const lines = (md || "").split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      out.push(
        <ul key={key} className="my-1 ml-5 list-disc space-y-1 text-gray-700">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };
  lines.forEach((raw, idx) => {
    const t = raw.trim();
    if (/^[-*]\s+/.test(t)) {
      bullets.push(t.replace(/^[-*]\s+/, ""));
      return;
    }
    flush(`ul-${idx}`);
    if (!t) return;
    if (t.startsWith("## "))
      out.push(
        <h4 key={idx} className="mt-3 mb-1 font-semibold text-gray-900">
          {t.slice(3)}
        </h4>
      );
    else if (t.startsWith("# "))
      out.push(
        <h3 key={idx} className="mt-3 mb-1 text-lg font-semibold text-gray-900">
          {t.slice(2)}
        </h3>
      );
    else
      out.push(
        <p key={idx} className="my-1 leading-relaxed text-gray-700">
          {t}
        </p>
      );
  });
  flush("ul-end");
  return <div>{out}</div>;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white/80 p-5 shadow-sm backdrop-blur">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Dashboard(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);

  const [goalTitle, setGoalTitle] = useState("");
  const [goalDetail, setGoalDetail] = useState("");
  const [habitName, setHabitName] = useState("");
  const [habitCadence, setHabitCadence] = useState("quotidienne");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") setNotice("Google connecte avec succes.");
    else if (g === "denied") setNotice("Connexion Google refusee.");
    else if (g === "error")
      setNotice(`Erreur Google : ${params.get("msg") || "inconnue"}`);
    if (g) window.history.replaceState({}, "", "/");
  }, []);

  function act(fn: () => Promise<unknown>, after?: () => void) {
    start(async () => {
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Une erreur est survenue.");
      }
    });
  }

  function handleRun() {
    setRunResult(null);
    start(async () => {
      try {
        const res = await runBriefingNow();
        setRunResult(
          res.emailedTo
            ? `Briefing genere et envoye a ${res.emailedTo}.`
            : "Briefing genere (email non envoye)."
        );
        router.refresh();
      } catch (e) {
        setRunResult(
          e instanceof Error ? `Echec : ${e.message}` : "Echec du briefing."
        );
      }
    });
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* En-tete */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-sun-600">
            {greetingByHour()}, Dierry
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Ton assistant</h1>
        </div>
        <button
          onClick={handleRun}
          disabled={pending || !props.connected}
          className="rounded-xl bg-sun-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sun-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "..." : "Lancer le briefing"}
        </button>
      </header>

      {notice && (
        <div className="mb-4 rounded-xl border border-sun-100 bg-sun-50 px-4 py-3 text-sm text-sun-600">
          {notice}
        </div>
      )}
      {runResult && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
          {runResult}
        </div>
      )}
      {props.dbError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong>Base de donnees inaccessible.</strong> Verifie tes variables
          SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY et que le schema SQL a bien
          ete execute. Detail : {props.dbError}
        </div>
      )}

      {/* Connexion Google */}
      {!props.connected && (
        <div className="mb-6 rounded-2xl border border-sun-200 bg-sun-50 p-5">
          <h2 className="font-semibold text-gray-900">Connecte ton Google</h2>
          <p className="mt-1 text-sm text-gray-600">
            Autorise l&apos;acces a Gmail et a ton agenda pour que l&apos;agent
            puisse lire ta journee et t&apos;envoyer ton briefing.
          </p>
          <a
            href="/api/auth/google"
            className="mt-3 inline-block rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800"
          >
            Connecter Google
          </a>
        </div>
      )}

      <div className="space-y-5">
        {/* Briefing du jour */}
        <Card title="Briefing du jour">
          {props.briefing ? (
            <div>
              <p className="mb-1 text-xs text-gray-400">
                {props.briefing.date_label}
              </p>
              <p className="text-gray-800">{props.briefing.content.greeting}</p>
              {props.briefing.content.focus && (
                <div className="my-3 rounded-xl border-l-4 border-sun-500 bg-sun-50 px-4 py-2">
                  <span className="text-xs uppercase tracking-wide text-sun-600">
                    Focus du jour
                  </span>
                  <p className="text-gray-900">{props.briefing.content.focus}</p>
                </div>
              )}
              <PlanText md={props.briefing.content.plan} />

              {props.briefing.content.priorities?.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 font-semibold text-gray-900">A traiter</h4>
                  <ul className="ml-5 list-disc space-y-1 text-gray-700">
                    {props.briefing.content.priorities.map((p, i) => (
                      <li key={i}>
                        <strong>{p.title}</strong>
                        {p.why ? ` — ${p.why}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {props.briefing.content.goalReminders?.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 font-semibold text-gray-900">
                    Tes objectifs
                  </h4>
                  <ul className="ml-5 list-disc space-y-1 text-gray-700">
                    {props.briefing.content.goalReminders.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {props.briefing.content.habitNudges?.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 font-semibold text-gray-900">
                    Tes habitudes
                  </h4>
                  <ul className="ml-5 list-disc space-y-1 text-gray-700">
                    {props.briefing.content.habitNudges.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Pas encore de briefing. Connecte Google puis clique sur « Lancer le
              briefing », ou attends le cron du matin.
            </p>
          )}
        </Card>

        {/* Objectifs */}
        <Card title="Objectifs">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="Nouvel objectif"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sun-500"
            />
            <input
              value={goalDetail}
              onChange={(e) => setGoalDetail(e.target.value)}
              placeholder="Detail (optionnel)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sun-500"
            />
            <button
              onClick={() =>
                act(() => createGoal(goalTitle, goalDetail), () => {
                  setGoalTitle("");
                  setGoalDetail("");
                })
              }
              disabled={pending}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
          {props.goals.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun objectif pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {props.goals.map((g) => (
                <li
                  key={g.id}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <div>
                    <p className="font-medium text-gray-900">{g.title}</p>
                    {g.detail && (
                      <p className="text-sm text-gray-500">{g.detail}</p>
                    )}
                  </div>
                  <button
                    onClick={() => act(() => removeGoal(g.id))}
                    disabled={pending}
                    className="text-sm text-gray-400 transition hover:text-red-600"
                    aria-label="Supprimer"
                  >
                    Supprimer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Habitudes */}
        <Card title="Habitudes">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <input
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              placeholder="Nouvelle habitude (ex: sport, lecture)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sun-500"
            />
            <select
              value={habitCadence}
              onChange={(e) => setHabitCadence(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-sun-500"
            >
              <option value="quotidienne">Quotidienne</option>
              <option value="hebdomadaire">Hebdomadaire</option>
            </select>
            <button
              onClick={() =>
                act(() => createHabit(habitName, habitCadence), () =>
                  setHabitName("")
                )
              }
              disabled={pending}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
            >
              Ajouter
            </button>
          </div>
          {props.habits.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune habitude suivie.</p>
          ) : (
            <ul className="space-y-2">
              {props.habits.map((h) => {
                const doneToday = h.logged_days.includes(props.today);
                return (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => act(() => toggleHabit(h.id))}
                        disabled={pending}
                        className={
                          "flex h-6 w-6 items-center justify-center rounded-full border text-xs transition " +
                          (doneToday
                            ? "border-sun-500 bg-sun-500 text-white"
                            : "border-gray-300 text-transparent hover:border-sun-500")
                        }
                        aria-label="Marquer comme fait"
                      >
                        ✓
                      </button>
                      <div>
                        <p className="font-medium text-gray-900">{h.name}</p>
                        <p className="text-xs text-gray-400">
                          {h.cadence} · {h.done_last_7}/7 jours
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => act(() => removeHabit(h.id))}
                      disabled={pending}
                      className="text-sm text-gray-400 transition hover:text-red-600"
                      aria-label="Supprimer"
                    >
                      Supprimer
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <footer className="mt-8 text-center text-xs text-gray-400">
        Assistant autonome · briefing quotidien automatique
      </footer>
    </main>
  );
}
