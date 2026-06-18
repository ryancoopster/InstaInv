import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  // Minimal liveness response — don't disclose service name/version/time to scanners.
  return NextResponse.json({ ok: true });
}
