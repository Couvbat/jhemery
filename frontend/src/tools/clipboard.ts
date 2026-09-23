/** Copies `text`, reporting whether it worked — the API is absent on plain http and
 *  refused without a user gesture, and a tool that says "copied" when it did not is
 *  worse than one that stays quiet. */
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
