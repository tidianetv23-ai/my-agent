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

type CalEvent = { summary: string; start: string; end: string; location?: string };
type EmailItem = { from: string; subject: string; snippet: string; date: string };

type Props = {
  connected: boolean;
  goals: Goal[];
  habits: Habit[];
  briefing: Briefing;
  today: string;
  dbError: string | null;
  events?: CalEvent[];
  emails?: EmailItem[];
};

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon aprem";
  return "Bonsoir";
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  if (!iso.includes("T")) return "Jour";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function fromName(s: string): string {
  const m = s.match(/^(.*?)\s*<.*>$/);
  const name = (m ? m[1] : s).replace(/^"|"$/g, "").trim();
  return name || s;
}

// --- Habitudes : dates (YYYY-MM-DD), grille et serie en cours ---
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function lastNDays(n: number, today: string): string[] {
  const out: string[] = [];
  const d = new Date(today + "T00:00:00");
  for (let i = 0; i < n; i++) {
    out.push(ymd(d));
    d.setDate(d.getDate() - 1);
  }
  return out.reverse(); // du plus ancien au plus recent
}
function streakFromSet(set: Set<string>, today: string): number {
  const d = new Date(today + "T00:00:00");
  // Pas encore fait aujourd'hui : on part d'hier pour ne pas casser la serie
  if (!set.has(ymd(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(ymd(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// Le "halo" — signature visuelle de l'agent
function Orb({ size = 40, glow = 1 }: { size?: number; glow?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div className="halo-glow halo-glowpulse" style={{ position: "absolute", inset: -size * 0.4 * glow }} />
      <div className="halo-orb halo-breathe" style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

function PlanText({ md }: { md: string }) {
  const lines = (md || "").split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (bullets.length) {
      out.push(
        <ul key={key} className="plan-ul">
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
      out.push(<h4 key={idx} className="plan-h4">{t.slice(3)}</h4>);
    else if (t.startsWith("# "))
      out.push(<h3 key={idx} className="plan-h3">{t.slice(2)}</h3>);
    else out.push(<p key={idx} className="plan-p">{t}</p>);
  });
  flush("ul-end");
  return <div>{out}</div>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel" style={{ padding: 20 }}>
      <h2 className="card-title">{title}</h2>
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

  const events = props.events ?? [];
  const emails = props.emails ?? [];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("google");
    if (g === "connected") setNotice("Google connecté avec succès.");
    else if (g === "denied") setNotice("Connexion Google refusée.");
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
            ? `Briefing généré et envoyé à ${res.emailedTo}.`
            : "Briefing généré (email non envoyé)."
        );
        router.refresh();
      } catch (e) {
        setRunResult(
          e instanceof Error ? `Échec : ${e.message}` : "Échec du briefing."
        );
      }
    });
  }

  return (
    <div className="halo-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .halo-root, .halo-root * { box-sizing: border-box; }
        .halo-root {
          --panel:rgba(255,255,255,.03); --panel2:rgba(255,255,255,.05);
          --border:rgba(255,255,255,.08); --borderS:rgba(255,255,255,.15);
          --text:#ECEEF5; --muted:#868D9E; --soft:#C7CBD6; --mint:#6EE7D6; --danger:#FF6B7A;
          font-family:'Inter',system-ui,sans-serif; color:var(--text); min-height:100vh;
          background:
            radial-gradient(1100px 560px at 12% -12%, rgba(255,111,165,.11), transparent 60%),
            radial-gradient(880px 480px at 102% -4%, rgba(155,107,255,.11), transparent 55%),
            #090B11;
        }
        .halo-root .display{font-family:'Space Grotesk',system-ui,sans-serif;}
        .halo-root .mono{font-family:'JetBrains Mono',ui-monospace,monospace;}
        .halo-root .eyebrow{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);}
        .halo-orb{border-radius:50%;background:radial-gradient(circle at 32% 27%,#FFD9AE,#FF6FA5 47%,#9B6BFF 84%);box-shadow:inset 0 0 20px rgba(255,255,255,.4);}
        .halo-glow{border-radius:50%;background:radial-gradient(circle,rgba(255,140,170,.6),rgba(155,107,255,.28) 55%,transparent 72%);filter:blur(24px);}
        @keyframes halo-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @keyframes halo-glowpulse{0%,100%{opacity:.65;transform:scale(1)}50%{opacity:1;transform:scale(1.12)}}
        .halo-breathe{animation:halo-breathe 5.5s ease-in-out infinite;}
        .halo-glowpulse{animation:halo-glowpulse 5.5s ease-in-out infinite;}
        .halo-root .panel{background:var(--panel);border:1px solid var(--border);border-radius:20px;backdrop-filter:blur(12px);}
        .halo-root .card-title{font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;}
        .halo-root .btn-primary{font-family:'Inter',sans-serif;font-weight:600;font-size:13px;color:#2a0f1e;border:none;border-radius:12px;padding:9px 16px;cursor:pointer;background:linear-gradient(180deg,#FFD9AE,#FF8FB0);box-shadow:0 4px 18px rgba(255,111,165,.3);transition:transform .15s ease,opacity .15s ease;}
        .halo-root .btn-primary:hover:not(:disabled){transform:translateY(-1px);}
        .halo-root .btn-primary:disabled{opacity:.4;cursor:not-allowed;box-shadow:none;}
        .halo-root .btn-dark{font-family:'Inter',sans-serif;font-weight:600;font-size:13px;color:var(--text);border:1px solid var(--borderS);border-radius:10px;padding:9px 16px;cursor:pointer;background:rgba(255,255,255,.04);transition:all .15s ease;white-space:nowrap;}
        .halo-root .btn-dark:hover:not(:disabled){background:var(--panel2);border-color:rgba(255,255,255,.25);}
        .halo-root .btn-dark:disabled{opacity:.4;cursor:not-allowed;}
        .halo-root .hinput,.halo-root .hselect{font-family:'Inter',sans-serif;font-size:13px;color:var(--text);background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:10px;padding:9px 12px;outline:none;transition:border-color .15s ease;}
        .halo-root .hinput::placeholder{color:var(--muted);}
        .halo-root .hinput:focus,.halo-root .hselect:focus{border-color:#FF6FA5;}
        .halo-root .hselect option{background:#12151d;color:var(--text);}
        .halo-root .del{font-family:'Inter',sans-serif;font-size:13px;color:var(--muted);background:none;border:none;cursor:pointer;transition:color .15s ease;}
        .halo-root .del:hover:not(:disabled){color:var(--danger);}
        .halo-root .focus-box{border-left:3px solid #FF6FA5;background:linear-gradient(90deg,rgba(255,111,165,.12),transparent);border-radius:8px;padding:10px 14px;margin:12px 0;}
        .halo-root .notice{border-radius:12px;padding:11px 14px;font-size:13px;margin-bottom:14px;border:1px solid var(--border);background:var(--panel2);color:var(--soft);}
        .halo-root .notice-accent{border-color:rgba(255,111,165,.3);background:rgba(255,111,165,.08);color:#FFC2D6;}
        .halo-root .notice-danger{border-color:rgba(255,107,122,.3);background:rgba(255,107,122,.08);color:#FFB3BB;}
        .halo-root .plan-p{margin:4px 0;line-height:1.6;color:var(--soft);}
        .halo-root .plan-h4{margin:12px 0 4px;font-weight:600;color:var(--text);}
        .halo-root .plan-h3{margin:12px 0 4px;font-size:17px;font-weight:600;color:var(--text);}
        .halo-root .plan-ul{margin:4px 0 4px 20px;list-style:disc;}
        .halo-root .plan-ul li{margin:3px 0;color:var(--soft);}
        .halo-root .sub-h4{margin:12px 0 4px;font-weight:600;color:var(--text);}
        .halo-root .toggle{height:24px;width:24px;border-radius:50%;border:1px solid var(--borderS);display:flex;align-items:center;justify-content:center;font-size:11px;color:transparent;background:transparent;cursor:pointer;transition:all .15s ease;flex-shrink:0;}
        .halo-root .toggle:hover:not(:disabled){border-color:#FF6FA5;}
        .halo-root .toggle-done{border-color:#6EE7D6;background:linear-gradient(180deg,#6EE7D6,#34C9B8);color:#06231f;box-shadow:0 0 12px rgba(110,231,214,.4);}
        .halo-root .row{border:1px solid var(--border);border-radius:12px;padding:10px 12px;}
        @media (prefers-reduced-motion: reduce){.halo-breathe,.halo-glowpulse{animation:none!important;}}
      `}</style>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* En-tete */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Orb size={40} />
            <div>
              <p className="eyebrow">{greetingByHour()}, Dierry</p>
              <h1 className="display" style={{ fontSize: 26, fontWeight: 600, margin: "2px 0 0" }}>
                Ton assistant
              </h1>
            </div>
          </div>
          <button onClick={handleRun} disabled={pending || !props.connected} className="btn-primary">
            {pending ? "..." : "Lancer le briefing"}
          </button>
        </header>

        {notice && <div className="notice notice-accent">{notice}</div>}
        {runResult && <div className="notice">{runResult}</div>}
        {props.dbError && (
          <div className="notice notice-danger">
            <strong>Base de données inaccessible.</strong> Vérifie tes variables
            SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY et que le schéma SQL a bien été
            exécuté. Détail : {props.dbError}
          </div>
        )}

        {/* Connexion Google */}
        {!props.connected && (
          <div className="panel" style={{ padding: 20, marginBottom: 24 }}>
            <div className="flex items-center gap-3" style={{ marginBottom: 6 }}>
              <Orb size={28} />
              <h2 className="display" style={{ fontSize: 17, fontWeight: 600 }}>
                Connecte ton Google
              </h2>
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Autorise l&apos;accès à Gmail et à ton agenda pour que l&apos;agent puisse
              lire ta journée et t&apos;envoyer ton briefing.
            </p>
            <a
              href="/api/auth/google"
              className="btn-primary"
              style={{ display: "inline-block", marginTop: 14, textDecoration: "none" }}
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
                <p className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                  {props.briefing.date_label}
                </p>
                <p style={{ color: "var(--text)" }}>{props.briefing.content.greeting}</p>
                {props.briefing.content.focus && (
                  <div className="focus-box">
                    <span className="eyebrow" style={{ color: "#FF9FBE" }}>Focus du jour</span>
                    <p style={{ color: "var(--text)", marginTop: 4 }}>
                      {props.briefing.content.focus}
                    </p>
                  </div>
                )}
                <PlanText md={props.briefing.content.plan} />

                {props.briefing.content.priorities?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 className="sub-h4">À traiter</h4>
                    <ul className="plan-ul">
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
                  <div style={{ marginTop: 12 }}>
                    <h4 className="sub-h4">Tes objectifs</h4>
                    <ul className="plan-ul">
                      {props.briefing.content.goalReminders.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {props.briefing.content.habitNudges?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <h4 className="sub-h4">Tes habitudes</h4>
                    <ul className="plan-ul">
                      {props.briefing.content.habitNudges.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Pas encore de briefing. Connecte Google puis clique sur « Lancer le
                briefing », ou attends le cron du matin.
              </p>
            )}
          </Card>

          {/* Agenda du jour */}
          <Card title="Agenda du jour">
            {events.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                {props.connected
                  ? "Rien de prévu aujourd'hui."
                  : "Connecte Google pour voir ton agenda."}
              </p>
            ) : (
              <ul>
                {events.map((e, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3"
                    style={{ padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
                  >
                    <span className="mono" style={{ fontSize: 13, color: "#FFB39C", width: 48, flexShrink: 0 }}>
                      {fmtTime(e.start)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 500, color: "var(--text)" }}>{e.summary}</p>
                      {e.location && (
                        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 1 }}>{e.location}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Mails a traiter */}
          <Card title="Mails à traiter">
            {emails.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                {props.connected
                  ? "Aucun mail important non lu."
                  : "Connecte Google pour voir tes mails."}
              </p>
            ) : (
              <ul>
                {emails.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3"
                    style={{ padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
                  >
                    <span
                      style={{
                        marginTop: 7,
                        flexShrink: 0,
                        display: "block",
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#FF6FA5",
                        boxShadow: "0 0 8px rgba(255,111,165,.7)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, color: "var(--muted)" }}>{fromName(m.from)}</p>
                      <p style={{ fontWeight: 600, color: "var(--text)", margin: "1px 0 3px" }}>{m.subject}</p>
                      <p
                        style={{
                          fontSize: 12.5,
                          color: "var(--muted)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          lineHeight: 1.4,
                        }}
                      >
                        {m.snippet}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Objectifs */}
          <Card title="Objectifs">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder="Nouvel objectif"
                className="hinput flex-1"
              />
              <input
                value={goalDetail}
                onChange={(e) => setGoalDetail(e.target.value)}
                placeholder="Détail (optionnel)"
                className="hinput flex-1"
              />
              <button
                onClick={() =>
                  act(() => createGoal(goalTitle, goalDetail), () => {
                    setGoalTitle("");
                    setGoalDetail("");
                  })
                }
                disabled={pending}
                className="btn-dark"
              >
                Ajouter
              </button>
            </div>
            {props.goals.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>
                Aucun objectif pour l&apos;instant.
              </p>
            ) : (
              <ul>
                {props.goals.map((g, i) => (
                  <li
                    key={g.id}
                    className="flex items-start justify-between gap-3"
                    style={{ padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
                  >
                    <div>
                      <p style={{ fontWeight: 500, color: "var(--text)" }}>{g.title}</p>
                      {g.detail && (
                        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>{g.detail}</p>
                      )}
                    </div>
                    <button
                      onClick={() => act(() => removeGoal(g.id))}
                      disabled={pending}
                      className="del"
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
                className="hinput flex-1"
              />
              <select
                value={habitCadence}
                onChange={(e) => setHabitCadence(e.target.value)}
                className="hselect"
              >
                <option value="quotidienne">Quotidienne</option>
                <option value="hebdomadaire">Hebdomadaire</option>
              </select>
              <button
                onClick={() => act(() => createHabit(habitName, habitCadence), () => setHabitName(""))}
                disabled={pending}
                className="btn-dark"
              >
                Ajouter
              </button>
            </div>
            {props.habits.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--muted)" }}>Aucune habitude suivie.</p>
            ) : (
              <ul className="space-y-2">
                {props.habits.map((h) => {
                  const logged = new Set(h.logged_days);
                  const doneToday = logged.has(props.today);
                  const streak = streakFromSet(logged, props.today);
                  const days = lastNDays(14, props.today);
                  return (
                    <li key={h.id} className="row" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => act(() => toggleHabit(h.id))}
                            disabled={pending}
                            className={"toggle" + (doneToday ? " toggle-done" : "")}
                            aria-label="Marquer comme fait"
                          >
                            ✓
                          </button>
                          <div>
                            <p style={{ fontWeight: 500, color: "var(--text)" }}>{h.name}</p>
                            <p className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>
                              {h.cadence} · {h.done_last_7}/7 j
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => act(() => removeHabit(h.id))}
                          disabled={pending}
                          className="del"
                          aria-label="Supprimer"
                        >
                          Supprimer
                        </button>
                      </div>

                      {/* Serie + grille des 14 derniers jours */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                          rowGap: 6,
                          flexWrap: "wrap",
                          paddingLeft: 36,
                        }}
                      >
                        <div style={{ display: "flex", gap: 3 }}>
                          {days.map((day, i) => {
                            const on = logged.has(day);
                            return (
                              <span
                                key={i}
                                title={day}
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 3,
                                  background: on ? "linear-gradient(180deg,#6EE7D6,#34C9B8)" : "rgba(255,255,255,.05)",
                                  border: on ? "none" : "1px solid var(--border)",
                                  boxShadow: on ? "0 0 6px rgba(110,231,214,.35)" : "none",
                                }}
                              />
                            );
                          })}
                        </div>
                        <span
                          className="mono"
                          style={{ fontSize: 11, color: streak > 0 ? "var(--mint)" : "var(--muted)", whiteSpace: "nowrap" }}
                        >
                          {streak > 0 ? `série ${streak} j` : "aucune série"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <footer className="mt-8 text-center" style={{ fontSize: 11, color: "var(--muted)" }}>
          Assistant autonome · briefing quotidien automatique
        </footer>
      </main>
    </div>
  );
}
