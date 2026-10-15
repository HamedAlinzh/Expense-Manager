import { en, type MessageKey } from "./en";

const dictionaries = { en } as const;
export type Locale = keyof typeof dictionaries;

/** Translate a key, interpolating `{name}` placeholders. */
export function t(key: MessageKey, vars?: Record<string, string | number>, locale: Locale = "en"): string {
  const template: string = dictionaries[locale][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export type { MessageKey };
