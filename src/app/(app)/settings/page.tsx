import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  return <SettingsView settings={await getSettings()} />;
}
