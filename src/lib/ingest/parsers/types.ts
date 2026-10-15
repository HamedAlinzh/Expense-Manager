export type Bank = "sepah" | "mellat" | "tejarat" | "blu" | "other";
export type ParsedType = "expense" | "income" | "refund";

/** Normalized output of every parser (bank-specific, generic or AI). Amounts are integer Rial. */
export type ParseResult = {
  parser: string;
  bank: Bank | null;
  type: ParsedType;
  amountRial: number;
  occurredAt: Date;
  /** "message" when the date/time came from the text, "received" when it fell back to received_at. */
  occurredAtSource: "message" | "received";
  /** Account number or (masked) card number as it appears in the message. */
  identifier: string | null;
  balanceAfterRial: number | null;
  description: string;
  merchant: string | null;
  confidence: number;
  notes: string[];
};

export type ParseContext = {
  receivedAt: Date;
  sender?: string;
  /** Bank(s) of the cards whose sender IDs matched; helps choose a profile. */
  bankHints?: Bank[];
};

/** A keyword that sets the transaction type. `ambiguous` lowers confidence (sent to review). */
export type TypeKeyword = { text: string; type: ParsedType; ambiguous?: boolean };

/**
 * A bank profile is data: markers that recognise the bank, and the keywords it uses.
 * Add or adjust patterns here; the shared extractor does the rest.
 */
export type BankProfile = {
  id: string;
  bank: Bank;
  /** Body text that identifies this bank (e.g. "بانک تجارت"). */
  bodyMarkers: RegExp[];
  /** Typical sender IDs, used only when no card sender matched (e.g. pasted into Telegram). */
  senderHints: RegExp[];
  /** Checked in order; put longer/more specific phrases first. */
  keywords: TypeKeyword[];
  /** Header lines to drop from the description. */
  headerLines: RegExp[];
};
