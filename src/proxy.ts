import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/** Endpoints with their own authentication (ingest token, Telegram secret) or none (health). */
const SELF_AUTHENTICATED = ["/api/ingest/", "/api/telegram/", "/api/health"];
const PUBLIC_PAGES = ["/login"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function startsWithAny(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p));
}

/** CSRF: state-changing browser requests must carry an Origin matching this host. */
function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Strict CSP: scripts only with this request's nonce (Next.js applies it to its own scripts).
 * Inline style *attributes* are allowed because React/Radix/Recharts set them; they can't run code.
 */
function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** Continues to the page with a fresh nonce on the request (for rendering) and the CSP on the response. */
function nextWithCsp(req: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (startsWithAny(pathname, SELF_AUTHENTICATED)) return NextResponse.next();

  if (!SAFE_METHODS.has(req.method) && !sameOrigin(req)) {
    return new NextResponse("Cross-origin request blocked", { status: 403 });
  }

  if (startsWithAny(pathname, PUBLIC_PAGES)) return nextWithCsp(req);

  // Signature/expiry only; revocation (session version) is checked in the data layer.
  const claims = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return isApi ? NextResponse.next() : nextWithCsp(req);

  if (isApi) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)"],
};
