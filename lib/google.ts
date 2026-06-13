import { google } from "googleapis";
type GoogleAuth = InstanceType<typeof google.auth.OAuth2>;
import { requireEnv } from "./env";
import { db } from "./supabase";

// Permissions demandees a Google : lire les mails, en envoyer, lire l'agenda.
export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function oauthClient(redirectUri?: string): GoogleAuth {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri
  );
}

export function getAuthUrl(redirectUri: string): string {
  return oauthClient(redirectUri).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force la delivrance d'un refresh_token
    scope: GOOGLE_SCOPES,
  });
}

export async function exchangeCodeAndStore(
  code: string,
  redirectUri: string
): Promise<void> {
  const client = oauthClient(redirectUri);
  const { tokens } = await client.getToken(code);
  const { error } = await db()
    .from("google_tokens")
    .upsert({
      id: 1,
      refresh_token: tokens.refresh_token ?? null,
      access_token: tokens.access_token ?? null,
      expiry_date: tokens.expiry_date ?? null,
      scope: tokens.scope ?? null,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`Sauvegarde des tokens: ${error.message}`);
}

export async function isGoogleConnected(): Promise<boolean> {
  const { data } = await db()
    .from("google_tokens")
    .select("refresh_token")
    .eq("id", 1)
    .maybeSingle();
  return Boolean(data && data.refresh_token);
}

// Client OAuth pret a l'emploi (rafraichit l'access_token tout seul).
export async function getAuthedClient(): Promise<GoogleAuth> {
  const { data, error } = await db()
    .from("google_tokens")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.refresh_token) {
    throw new Error(
      "Google n'est pas connecte. Ouvre le dashboard et clique sur « Connecter Google »."
    );
  }
  const client = oauthClient();
  client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token ?? undefined,
    expiry_date: data.expiry_date ?? undefined,
  });
  client.on("tokens", async (t) => {
    await db()
      .from("google_tokens")
      .update({
        access_token: t.access_token ?? data.access_token,
        expiry_date: t.expiry_date ?? data.expiry_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
  });
  return client;
}

export async function getAccountEmail(auth: GoogleAuth): Promise<string> {
  const gmail = google.gmail({ version: "v1", auth });
  const profile = await gmail.users.getProfile({ userId: "me" });
  return profile.data.emailAddress || "";
}

// --- Agenda ---
export type CalEvent = {
  summary: string;
  start: string;
  end: string;
  location?: string;
};

// Calcule le decalage du fuseau (ms) a un instant donne, gere l'heure d'ete.
function tzOffsetMs(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(at)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - at.getTime();
}

export async function getTodayEvents(
  auth: GoogleAuth,
  tz: string
): Promise<CalEvent[]> {
  const cal = google.calendar({ version: "v3", auth });
  const now = new Date();
  const off = tzOffsetMs(tz, now);
  const local = new Date(now.getTime() + off);
  const startLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    0,
    0,
    0,
    0
  );
  const endLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    23,
    59,
    59,
    999
  );
  const timeMin = new Date(startLocal - off).toISOString();
  const timeMax = new Date(endLocal - off).toISOString();

  const res = await cal.events.list({
    calendarId: "primary",
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 20,
    timeZone: tz,
  });
  return (res.data.items || []).map((e) => ({
    summary: e.summary || "(sans titre)",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    location: e.location || undefined,
  }));
}

// --- Mails ---
export type EmailItem = {
  from: string;
  subject: string;
  snippet: string;
  date: string;
};

export async function getRecentImportantEmails(
  auth: GoogleAuth
): Promise<EmailItem[]> {
  const gmail = google.gmail({ version: "v1", auth });
  const list = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread in:inbox newer_than:1d",
    maxResults: 15,
  });
  const ids = (list.data.messages || [])
    .map((m) => m.id)
    .filter((x): x is string => Boolean(x));

  const items: EmailItem[] = [];
  for (const id of ids) {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });
    const headers = msg.data.payload?.headers || [];
    const h = (name: string) =>
      headers.find((x) => (x.name || "").toLowerCase() === name.toLowerCase())
        ?.value || "";
    items.push({
      from: h("From"),
      subject: h("Subject"),
      snippet: msg.data.snippet || "",
      date: h("Date"),
    });
  }
  return items;
}

// --- Envoi ---
export async function sendEmail(
  auth: GoogleAuth,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  const gmail = google.gmail({ version: "v1", auth });
  const subjectEncoded = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const lines = [
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ];
  const raw = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
}
