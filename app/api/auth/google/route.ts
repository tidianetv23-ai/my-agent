import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  try {
    const redirectUri = `${origin(req)}/api/auth/callback`;
    return NextResponse.redirect(getAuthUrl(redirectUri));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
