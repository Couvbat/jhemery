/**
 * Uppercase and strip diacritics, so `épée` and `EPEE` are the same word. NFD
 * splits an accented letter into base + combining mark, and the replaced range
 * is exactly the combining-marks block — which is why this handles every accent
 * French uses without listing any of them.
 *
 * Its own leaf module rather than a function of `terminal/games/words.ts`, which the games
 * re-export it from: the palette's search folds the same way, and importing it from there
 * put the word-list loaders in the first paint for one regular expression.
 */
export function fold(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
}
