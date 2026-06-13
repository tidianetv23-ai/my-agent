import { NextRequest, NextResponse } from "next/server";
import { runDailyBriefing } from "@/lib/briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Vercel envoie "Authorization: Bearer <CRON_SECRET>" si la variable existe.
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }
  try {
    const result = await runDailyBriefing();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    console.error("Cron briefing:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
