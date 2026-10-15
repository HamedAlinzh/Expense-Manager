import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { backupDir, listBackups } from "@/server/jobs/backup";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [settings, backups] = await Promise.all([getSettings(), listBackups()]);
  return <SettingsView settings={settings} backups={backups} backupDir={backupDir()} />;
}
