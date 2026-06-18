import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SECRET_KEY } from "@/lib/secret";

const SESSION_COOKIE = "instainv_session";

// Routes that never require a session. /api/pricing/cron is here because it
// authenticates with its own PRICING_CRON_SECRET header (for external schedulers
// that have no cookie); the route handler enforces that secret itself.
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/pricing/cron",
  "/api/notifications/cron",
  "/_next",
  "/favicon",
  "/uploads",
];

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, SECRET_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const authed = await isAuthed(req);
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  // Forward the current path so the (main) layout can enforce per-route permissions.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Run on everything except static assets handled above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
