import type { Metadata } from "next";
import { InboxView } from "@/components/inbox/inbox-view";
import { ignoredMessages, pendingTransactions, unparsedMessages } from "@/server/queries/inbox";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const [pending, unparsed, ignored] = await Promise.all([
    pendingTransactions(),
    unparsedMessages(),
    ignoredMessages(),
  ]);
  return <InboxView pending={pending} unparsed={unparsed} ignored={ignored} />;
}
