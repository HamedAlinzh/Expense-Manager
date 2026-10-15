import { getSession } from "@/lib/auth/session";
import { errorMessage, log } from "@/lib/logger";
import { UserError } from "@/server/errors";
import { restoreBackup } from "@/server/services/restore";

export const dynamic = "force-dynamic";

const MAX_BYTES = 100 * 1024 * 1024;

/** Restore from a JSON backup (Settings → Data). Session + same-origin (proxy) protected. */
export async function POST(req: Request) {
  if (!(await getSession()).authenticated) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES)
    return Response.json({ error: "Backup file is too large" }, { status: 413 });
  let payload: unknown;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Choose a backup file" }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "Backup file is too large" }, { status: 413 });
    payload = JSON.parse(await file.text());
  } catch {
    return Response.json({ error: "Couldn't read that file as JSON" }, { status: 400 });
  }
  try {
    const counts = await restoreBackup(payload);
    log.info("restore: completed", counts);
    return Response.json({ ok: true, counts });
  } catch (err) {
    if (err instanceof UserError) return Response.json({ error: err.message }, { status: 400 });
    log.error("restore: failed", { error: errorMessage(err) });
    return Response.json({ error: "Restore failed; nothing was changed." }, { status: 500 });
  }
}
