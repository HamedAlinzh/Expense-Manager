import "server-only";
import { verify } from "@node-rs/argon2";
import { env } from "@/lib/env";

/** Accepts either a raw "$argon2id$..." hash or the "b64:..." form printed by scripts/hash-password.mjs. */
export function decodeStoredHash(value: string): string {
  if (value.startsWith("b64:")) return Buffer.from(value.slice(4), "base64").toString("utf8");
  return value;
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const stored = env().ADMIN_PASSWORD_HASH;
  if (!stored) throw new Error("ADMIN_PASSWORD_HASH is not configured");
  try {
    return await verify(decodeStoredHash(stored), password);
  } catch {
    return false;
  }
}
