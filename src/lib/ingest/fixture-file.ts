/** Reads the fixtures/sms/<bank>/*.txt format (see fixtures/sms/README.md). */
export type SmsFixture = { meta: Record<string, string>; body: string };

export function parseFixture(content: string): SmsFixture {
  const sep = content.search(/^---\s*$/m);
  if (sep === -1) throw new Error("fixture is missing the '---' separator");
  const header = content.slice(0, sep);
  const body = content
    .slice(sep)
    .replace(/^---\s*\n/, "")
    .replace(/\s+$/, "");
  const meta: Record<string, string> = {};
  for (const line of header.split("\n")) {
    const m = /^#\s*([\w.]+)\s*:\s*(.*)$/.exec(line.trim());
    if (m) meta[m[1]!] = m[2]!.trim();
  }
  return { meta, body };
}
