import { normalizeDigits, normalizeText } from "@/lib/format/text";

export type RuleField = "merchant" | "description" | "raw_text";
export type RuleMatch = "contains" | "regex" | "equals";
export type TxType = "expense" | "income" | "transfer" | "refund";

export type RuleLike = {
  id: number;
  matchField: RuleField;
  matchType: RuleMatch;
  pattern: string;
  categoryId: number;
  categoryKind: "expense" | "income";
  setType: TxType | null;
  priority: number;
  enabled: boolean;
};

export type RuleSubject = {
  merchant?: string | null;
  description?: string | null;
  rawText?: string | null;
};

export type RuleOutcome = { ruleId: number; categoryId: number; setType: TxType | null };

const MAX_PATTERN = 200;

/** Returns an error message for an unusable pattern, or null if it is valid. */
export function validatePattern(matchType: RuleMatch, pattern: string): string | null {
  if (pattern.trim() === "") return "Pattern is required";
  if (pattern.length > MAX_PATTERN) return `Pattern must be at most ${MAX_PATTERN} characters`;
  if (matchType === "regex") {
    try {
      new RegExp(pattern, "iu");
    } catch {
      return "Invalid regular expression";
    }
  }
  return null;
}

/** "merchant" rules fall back to the description when no merchant was extracted (e.g. manual entries). */
function fieldText(field: RuleField, s: RuleSubject): string {
  if (field === "merchant") return s.merchant?.trim() || s.description || "";
  if (field === "description") return s.description ?? "";
  return s.rawText ?? "";
}

export function matchesRule(
  rule: Pick<RuleLike, "matchField" | "matchType" | "pattern">,
  subject: RuleSubject,
): boolean {
  const text = fieldText(rule.matchField, subject);
  if (text === "") return false;
  switch (rule.matchType) {
    case "contains": {
      const needle = normalizeText(rule.pattern);
      return needle !== "" && normalizeText(text).includes(needle);
    }
    case "equals":
      return normalizeText(text) === normalizeText(rule.pattern);
    case "regex": {
      try {
        const re = new RegExp(rule.pattern, "iu");
        return re.test(text) || re.test(normalizeDigits(text));
      } catch {
        return false;
      }
    }
  }
}

function kindFits(rule: RuleLike, type: TxType | undefined): boolean {
  if (!type || rule.setType) return true;
  if (type === "transfer") return false;
  return rule.categoryKind === (type === "expense" ? "expense" : "income");
}

/** First enabled matching rule by priority (lower first), then id. Rules for the wrong category kind are skipped. */
export function applyRules(rules: RuleLike[], subject: RuleSubject, type?: TxType): RuleOutcome | null {
  const ordered = rules.filter((r) => r.enabled).sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const rule of ordered) {
    if (kindFits(rule, type) && matchesRule(rule, subject)) {
      return { ruleId: rule.id, categoryId: rule.categoryId, setType: rule.setType };
    }
  }
  return null;
}
