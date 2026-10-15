const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_ZERO = 0x0660; // ٠

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to Western digits. Other characters are untouched. */
export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= PERSIAN_ZERO ? code - PERSIAN_ZERO : code - ARABIC_ZERO);
  });
}

/** Converts Western digits to Persian digits (for Persian-style display). */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => String.fromCharCode(PERSIAN_ZERO + Number(d)));
}

/**
 * Canonical form for Persian text used in matching and search:
 * Western digits, Arabic yeh/kaf/teh-marbuta variants unified, tatweel and diacritics removed,
 * ZWNJ and whitespace runs collapsed to a single space, lower-cased Latin.
 */
export function normalizeText(input: string): string {
  return normalizeDigits(input)
    .replace(/[يى]/g, "ی") // ي ى → ی
    .replace(/ك/g, "ک") // ك → ک
    .replace(/ة/g, "ه") // ة → ه
    .replace(/[أإٱ]/g, "ا") // أ إ ٱ → ا
    .replace(/ـ/g, "") // tatweel
    .replace(/[ً-ٰٟ]/g, "") // harakat
    .replace(/[‌‏‎ \s]+/g, " ")
    .trim()
    .toLowerCase();
}

/** Light cleanup for text we store and display (keeps case and ZWNJ, fixes Arabic letter variants). */
export function cleanDisplayText(input: string): string {
  return input
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ \t ]+/g, " ")
    .trim();
}

const PERSIAN_SCRIPT = /[؀-ۿ]/;

export function hasPersian(input: string): boolean {
  return PERSIAN_SCRIPT.test(input);
}
