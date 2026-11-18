/**
 * Rule 1.13.3: which language a page's text is really in (common words and scripts), so a page
 * labelled French that still reads in English (an untranslated copy) can be flagged. No API calls.
 */
const COMMON: Record<string, string[]> = {
  en: ['the', 'and', 'with', 'for', 'you', 'your', 'this', 'that', 'are', 'from', 'our', 'have'],
  es: ['el', 'la', 'los', 'las', 'que', 'con', 'para', 'por', 'una', 'del', 'nuestro', 'como'],
  fr: ['le', 'la', 'les', 'des', 'est', 'une', 'pour', 'avec', 'dans', 'vous', 'nous', 'sur'],
  de: ['der', 'die', 'das', 'und', 'ist', 'mit', 'für', 'sie', 'nicht', 'auf', 'ein', 'eine'],
  it: ['il', 'la', 'che', 'per', 'con', 'una', 'del', 'della', 'sono', 'non', 'gli', 'nel'],
  pt: ['que', 'com', 'para', 'uma', 'não', 'dos', 'das', 'mais', 'por', 'seu', 'sua', 'você'],
  nl: ['de', 'het', 'een', 'en', 'van', 'voor', 'met', 'niet', 'zijn', 'ook', 'wij', 'uw'],
};
const SCRIPTS: [string, RegExp][] = [
  ['ar', /[\u0600-\u06FF]/g],
  ['he', /[\u0590-\u05FF]/g],
  ['ru', /[\u0400-\u04FF]/g],
  ['zh', /[\u4E00-\u9FFF]/g],
  ['ja', /[\u3040-\u30FF]/g],
];
/** Languages written right to left (Arabic script covers Urdu and Persian). */
export const RTL = new Set(['ar', 'he', 'ur', 'fa', 'ps', 'yi']);
/** Languages that share a detectable script with another code (detected 'ar' fits ur/fa labels). */
const SAME_SCRIPT: Record<string, string> = { ur: 'ar', fa: 'ar', ps: 'ar', yi: 'he', uk: 'ru', bg: 'ru', sr: 'ru' };

/** Best guess of the text's language (two-letter code), or null when too short or unclear. */
export function detectLanguage(text: string): string | null {
  const sample = text.slice(0, 20_000);
  const letters = (sample.match(/\p{L}/gu) ?? []).length;
  if (letters < 200) return null;
  for (const [code, re] of SCRIPTS) if ((sample.match(re) ?? []).length / letters > 0.3) return code;
  const words = sample.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 60) return null;
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const scores = Object.entries(COMMON).map(([code, list]) => [code, list.reduce((s, w) => s + (counts.get(w) ?? 0), 0) / words.length] as const).sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  // Clear winner only: at least 4% common words and twice the runner-up.
  return best && best[1] >= 0.04 && best[1] >= 2 * (second?.[1] ?? 0) ? best[0] : null;
}

/** The text is in a different language from its label (only when both are clear and comparable). */
export function untranslated(label: string | undefined, text: string): boolean {
  if (!label) return false;
  const want = label.toLowerCase().split('-')[0]!;
  const comparable = want in COMMON || SCRIPTS.some(([c]) => c === want) || want in SAME_SCRIPT;
  if (!comparable) return false;
  const got = detectLanguage(text);
  return got !== null && got !== want && got !== SAME_SCRIPT[want];
}
