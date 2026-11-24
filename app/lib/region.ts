/**
 * The customer's country, guessed from their browser's own language
 * settings. Null when it cannot be told.
 *
 * No network call and no IP lookup — nothing leaves the page. Intl.Locale
 * reads the region out of tags the browser already has: "en-GB" gives GB,
 * "pt-BR" gives BR.
 *
 * A GUESS, AND ONLY EVER A DEFAULT
 *
 * It is wrong often: travellers, borrowed phones, anybody whose system
 * language is plain "en" with no region at all. So it may preselect
 * something, and must never decide anything. Where it returns null the
 * right answer is an empty picker, not the first row of a list — that is
 * how every customer in the world ended up looking at a form preset to
 * Ghana, which is not a default anybody chose.
 *
 * This lived in two files with identical bodies. The navigation lists
 * taught the same lesson three times: a copy is a thing that will one day
 * disagree with its original.
 */
export function browserRegion(): string | null {
  try {
    const tags = [navigator.language, ...(navigator.languages ?? [])];
    for (const tag of tags) {
      const region = new Intl.Locale(tag).region;
      if (region) return region;
    }
  } catch {
    /* Intl.Locale is not everywhere. */
  }
  return null;
}
