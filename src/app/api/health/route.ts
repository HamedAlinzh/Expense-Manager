import { sql } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await sql()`select 1`;
    return Response.json({ status: "ok", db: "ok", time: new Date().toISOString() });
  } catch {
    return Response.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
