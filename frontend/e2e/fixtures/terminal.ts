import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The terminal, driven as a user drives it.
 *
 * One place that knows the selectors, so a template change is one edit rather than
 * one per spec. Everything here goes through the keyboard: the overlay owns focus
 * (it holds the keyboard for games via `capture()`), and clicking things into place
 * would test a path no visitor takes.
 *
 * What this helper is *not* for is exercising the command registry. That is already
 * covered exhaustively in jsdom by `src/terminal/__tests__/`; running it again
 * through a browser buys nothing and costs a hundredfold.
 */
export class Terminal {
  constructor(readonly page: Page) {}

  /** The overlay panel. Absent until the terminal has been opened once. */
  get panel(): Locator {
    return this.page.getByRole('dialog')
  }

  get input(): Locator {
    return this.page.locator('#terminal-input')
  }

  /** The scrollback. `data-testid` because the alternative is a chain of Tailwind classes. */
  get output(): Locator {
    return this.page.getByTestId('terminal-output')
  }

  /**
   * Opens with the backtick shortcut and waits for the overlay's async chunk —
   * the whole command registry, the guestbook client, the vim editor — to load and
   * take focus. Everything after this can assume a live prompt.
   */
  async open(): Promise<void> {
    // Waiting for the launcher first is not cosmetic: the backtick shortcut is a
    // window listener registered in `TerminalLauncher`'s `onMounted`, so a keypress
    // sent before hydration lands on nothing at all and the test fails looking for a
    // dialog that was never asked to open. The button appearing is the app telling
    // us the listener exists.
    await expect(this.page.getByRole('button', { name: /open terminal/i })).toBeVisible()
    await this.page.keyboard.press('`')
    // A longer wait than the default here alone: opening the terminal is the one
    // action in the suite gated on fetching a large async chunk, and with several
    // workers each running a three.js scene, five seconds is not always enough on a
    // busy machine. Everything after this is local and keeps the default timeout.
    await expect(this.panel).toBeVisible({ timeout: 15_000 })
    await expect(this.input).toBeFocused()
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.panel).toBeHidden()
  }

  /** Types a command, submits it, and resolves once the shell is idle again. */
  async run(command: string): Promise<void> {
    await this.input.fill(command)
    await this.input.press('Enter')

    // The input is `:disabled` while a command runs, so it re-enabling is the shell
    // itself saying it has settled — no sleep involved. The "or gone" half is not
    // defensive padding: `cd`, `ping` and the other navigating commands close the
    // overlay on success, and waiting for an element that was unmounted on purpose
    // would turn every one of them into a timeout.
    await expect
      .poll(async () => (await this.input.count()) === 0 || (await this.input.isEnabled()))
      .toBe(true)
  }

  /** Asserts the scrollback contains a line, retrying until it does. */
  async expectOutput(match: string | RegExp): Promise<void> {
    await expect(this.output).toContainText(match)
  }
}
