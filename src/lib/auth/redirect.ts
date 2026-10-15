/** Only same-site relative paths; blocks "//evil.com" and "/\\evil.com" style open redirects. */
export function safeNextPath(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
