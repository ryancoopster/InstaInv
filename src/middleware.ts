import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SECRET_KEY } from "@/lib/secret";

const SESSION_COOKIE = "instainv_session";

// SEC-5: nonce-based Content-Security-Policy. Generated per request here so we can
// drop 'unsafe-inline' from script-src (the weakest link for XSS containment).
// Next 14.2 reads the nonce from the request's CSP header and propagates it to its
// own hydration/bootstrap scripts; third-party inline scripts (next-themes) get it
// via the x-nonce header threaded through the root layout. 'strict-dynamic' lets
// nonce'd scripts load their dependencies. style-src keeps 'unsafe-inline' — Next/
// Tailwind emit inline styles and 'strict-dynamic' does not apply to styles.
//
// IMPORTANT: `next dev` relies on eval (Fast Refresh / HMR) and a websocket, which
// the strict prod policy would block — leaving the page unstyled. So in development
// we relax script-src to 'unsafe-eval' 'unsafe-inline' and allow ws: for HMR. The
// strict nonce policy applies only to production builds.
const IS_PROD = process.env.NODE_ENV === "production";

function buildCsp(nonce: string): string {
  const scriptSrc = IS_PROD
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = IS_PROD ? "connect-src 'self'" : "connect-src 'self' ws: wss:";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc,
    "font-src 'self' data:",
    connectSrc,
    "form-action 'self'",
  ].join("; ");
}

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

  // SEC-5: per-request nonce + CSP. The nonce is set on the REQUEST CSP header
  // (so Next nonces its scripts) and exposed via x-nonce (so the root layout can
  // pass it to next-themes); the same CSP is also written to every response.
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const withCsp = (res: NextResponse): NextResponse => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const authed = await isAuthed(req);
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return withCsp(NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 }));
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return withCsp(NextResponse.redirect(url));
  }
  // Forward the current path so the (main) layout can enforce per-route permissions.
  requestHeaders.set("x-pathname", pathname);
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  // Run on everything except static assets handled above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
