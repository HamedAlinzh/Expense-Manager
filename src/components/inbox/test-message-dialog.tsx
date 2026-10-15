"use client";

import { FlaskConical, LoaderCircle, ShieldAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { testMessage } from "@/app/(app)/inbox/actions";
import { Field } from "@/components/form/field";
import { DateTime, Money } from "@/components/prefs/display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Result = Awaited<ReturnType<typeof testMessage>>;

export function TestMessageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [body, setBody] = useState("");
  const [sender, setSender] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      setResult(await testMessage({ body, sender: sender.trim() || undefined }));
    });

  const data = result?.ok ? result.data : null;
  const r = data && !data.otp ? data.result : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Test a message</DialogTitle>
          <DialogDescription>Paste a bank SMS to see how it would be read. Nothing is saved.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Field label="Sender (optional)">
            <Input
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              placeholder="e.g. TejaratBank"
              dir="ltr"
            />
          </Field>
          <Field label="Message">
            <Textarea
              rows={7}
              dir="auto"
              className="font-persian leading-7"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </Field>
          <Button onClick={run} disabled={pending || !body.trim()} className="self-end">
            {pending ? <LoaderCircle className="animate-spin" /> : <FlaskConical />} Test
          </Button>
        </div>
        {result && !result.ok && <p className="text-sm text-destructive">{result.error}</p>}
        {data?.otp && (
          <p className="flex items-center gap-2 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">
            <ShieldAlert className="size-4" /> Detected as a one-time password — it would be discarded without storing
            its text.
          </p>
        )}
        {data && !data.otp && (
          <div className="rounded-2xl border border-border p-4 text-sm animate-in fade-in">
            {data.senderKnown === false && (
              <p className="mb-2 text-amber-300">
                This sender isn&apos;t linked to a card, so the message would be ignored.
              </p>
            )}
            {data.masked > 0 && (
              <p className="mb-2 text-muted-foreground">{data.masked} full card number(s) would be masked.</p>
            )}
            {r ? (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5">
                <dt className="text-muted-foreground">Amount</dt>
                <dd>
                  <Money rial={r.amountRial} kind={r.type} />
                </dd>
                <dt className="text-muted-foreground">When</dt>
                <dd>
                  <DateTime date={r.occurredAt} time />{" "}
                  <span className="text-xs text-muted-foreground">
                    ({r.occurredAtSource === "message" ? "from message" : "received time"})
                  </span>
                </dd>
                <dt className="text-muted-foreground">Description</dt>
                <dd dir="auto">{r.description}</dd>
                <dt className="text-muted-foreground">Account / card</dt>
                <dd dir="ltr" className="text-left">
                  {r.identifier ?? "—"}
                </dd>
                <dt className="text-muted-foreground">Balance after</dt>
                <dd>{r.balanceAfterRial !== null ? <Money rial={r.balanceAfterRial} colored={false} /> : "—"}</dd>
                <dt className="text-muted-foreground">Parser</dt>
                <dd>
                  {r.parser} · confidence {Math.round(r.confidence * 100)}%{" "}
                  <span className="text-xs text-muted-foreground">
                    ({r.confidence >= 0.9 ? "auto-confirmed when a card matches" : "goes to review"})
                  </span>
                </dd>
                {data.senderCards.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Sender cards</dt>
                    <dd>{data.senderCards.join(", ")}</dd>
                  </>
                )}
                {r.notes.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Notes</dt>
                    <dd dir="auto">{r.notes.join(" · ")}</dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground">
                No transaction recognised — it would wait in the inbox as an unparsed message.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
