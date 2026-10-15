import "server-only";
import { spawn } from "node:child_process";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { log } from "@/lib/logger";
import { tehranParts } from "@/lib/format/time";

const FILE_RE = /^expense-\d{4}-\d{2}-\d{2}-\d{6}\.dump$/;

export function backupDir(): string {
  return env().BACKUP_DIR ?? (process.env.NODE_ENV === "production" ? "/backups" : path.join(process.cwd(), "backups"));
}

/** libpq environment from DATABASE_URL, so the password never appears on a command line. */
function pgEnv(): NodeJS.ProcessEnv {
  const u = new URL(env().DATABASE_URL);
  return {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")),
  };
}

function run(cmd: string, args: string[], envVars: NodeJS.ProcessEnv): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: envVars, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", (err) => resolve({ code: -1, stderr: err.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

export type BackupFile = { name: string; bytes: number; createdAt: Date };

export async function listBackups(): Promise<BackupFile[]> {
  const dir = backupDir();
  let names: string[] = [];
  try {
    names = (await readdir(dir)).filter((n) => FILE_RE.test(n));
  } catch {
    return [];
  }
  const files = await Promise.all(
    names.map(async (name) => {
      const s = await stat(path.join(dir, name));
      return { name, bytes: s.size, createdAt: s.mtime };
    }),
  );
  return files.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * pg_dump (custom format, compressed) into BACKUP_DIR, written atomically, then keeps the newest
 * BACKUP_KEEP files. Returns null (with a warning) when pg_dump isn't installed — e.g. local dev.
 */
export async function runBackup(now = new Date()): Promise<BackupFile | null> {
  const dir = backupDir();
  const probe = await run("pg_dump", ["--version"], process.env);
  if (probe.code !== 0) {
    log.warn("backup: pg_dump not available, skipping", { error: probe.stderr.slice(0, 200) });
    return null;
  }
  await mkdir(dir, { recursive: true });
  const p = tehranParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  const name = `expense-${p.year}-${pad(p.month)}-${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}${pad(p.second)}.dump`;
  const final = path.join(dir, name);
  const partial = `${final}.partial`;

  const res = await run(
    "pg_dump",
    ["--format=custom", "--compress=9", "--no-owner", "--no-privileges", `--file=${partial}`],
    pgEnv(),
  );
  if (res.code !== 0) {
    await rm(partial, { force: true });
    throw new Error(`pg_dump failed: ${res.stderr.slice(0, 300)}`);
  }
  await rename(partial, final);

  const keep = env().BACKUP_KEEP;
  const all = await listBackups();
  for (const old of all.slice(keep)) await rm(path.join(dir, old.name), { force: true });
  const s = await stat(final);
  log.info("backup: written", { file: name, bytes: s.size, kept: Math.min(all.length, keep) });
  return { name, bytes: s.size, createdAt: s.mtime };
}
