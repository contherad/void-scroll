// words.ts — Shared validation for community-submitted Daily words. Used by the
// client (instant feedback) and the server (authoritative). A submitted word
// becomes the secret phrase of a future Daily Descent, attributed to its author.

export const WORD_MIN = 3;
export const WORD_MAX = 8;

// Minimal all-ages guard for a public Reddit game. NOT exhaustive — production would
// lean on Reddit automod / a maintained list. Exact-match (no Scunthorpe false
// positives on legit words like CLASS/GRAPE), plus a couple of hard slur substrings
// that essentially never occur in legit short words.
const BLOCKED = new Set([
  'fuck', 'fucks', 'fuk', 'shit', 'shyt', 'cunt', 'cunts', 'bitch', 'dick', 'cock',
  'cocks', 'pussy', 'slut', 'whore', 'sex', 'porn', 'penis', 'dildo', 'rape', 'rapes',
  'nazi', 'nazis', 'kkk', 'jizz', 'cum', 'tits', 'anus', 'arse', 'wank', 'ass',
]);
const BLOCKED_SUBSTR = ['nigg', 'fagg'];

export type WordCheck = { ok: true; word: string } | { ok: false; reason: string };

export function validateWord(raw: string): WordCheck {
  const word = (raw || '').trim().toUpperCase();
  if (!/^[A-Z]+$/.test(word)) return { ok: false, reason: 'Letters A–Z only' };
  if (word.length < WORD_MIN || word.length > WORD_MAX) {
    return { ok: false, reason: `${WORD_MIN}–${WORD_MAX} letters` };
  }
  const lower = word.toLowerCase();
  if (BLOCKED.has(lower) || BLOCKED_SUBSTR.some((s) => lower.includes(s))) {
    return { ok: false, reason: 'Keep it friendly' };
  }
  return { ok: true, word };
}
