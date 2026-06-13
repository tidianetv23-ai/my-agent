import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeAndStore } from "@/lib/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function origin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const base = origin(req);
  const code = req.nextUrl.searchParams.get("code");
  const err = req.nextUrl.searchParams.get("error");

  if (err) return NextResponse.redirect(`${base}/?google=denied`);
  if (!code) return NextResponse.redirect(`${base}/?google=missing`);

  try {
    await exchangeCodeAndStore(code, `${base}/api/auth/callback`);
    return NextResponse.redirect(`${base}/?google=connected`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.redirect(
      `${base}/?google=error&msg=${encodeURIComponent(msg)}`
    );
  }
}
