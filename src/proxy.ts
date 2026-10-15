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

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (startsWithAny(pathname, SELF_AUTHENTICATED)) return NextResponse.next();

  if (!SAFE_METHODS.has(req.method) && !sameOrigin(req)) {
    return new NextResponse("Cross-origin request blocked", { status: 403 });
  }

  if (startsWithAny(pathname, PUBLIC_PAGES)) return NextResponse.next();

  // Signature/expiry only; revocation (session version) is checked in the data layer.
  const claims = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)"],
};
