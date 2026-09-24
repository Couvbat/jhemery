import { expect, test } from './fixtures'
import { profile } from '@/content/profile'

/**
 * The terminal as a *shell*, not as a command registry.
 *
 * Every command's behaviour is already pinned down in jsdom by
 * `src/terminal/__tests__/` — around 1800 assertions that run in seconds. What is
 * tested here is the handful of seams those tests have to stub: that the overlay's
 * async chunk really loads and takes focus, that the keyboard shortcut behaves
 * differently inside a form field, that history survives a reload, that `cd` moves
 * the actual page, that Ctrl+C reaches an in-flight command's AbortSignal, and that
 * a capture always gives the keyboard back.
 */

test.describe('terminal', () => {
  test.skip(
    () => test.info().project.name === 'mobile',
    'The launcher is `hidden md:flex`: a fixed input panel fights a mobile virtual keyboard badly enough that no terminal beats a broken one.',
  )

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test.describe('opening and closing', () => {
    test('the backtick shortcut opens it and focuses the prompt', async ({ page, terminal }) => {
      await expect(terminal.panel).toBeHidden()

      // `open()` asserts both the panel and the focus. Getting here at all means the
      // async chunk — the whole command registry, the guestbook client, the vim
      // editor — was fetched and mounted, which is the part jsdom never exercises.
      await terminal.open()
      await expect(page.getByRole('button', { name: /open terminal/i })).toBeHidden()
    })

    test('the launcher button opens it too', async ({ page, terminal }) => {
      await page.getByRole('button', { name: /open terminal/i }).click()

      await expect(terminal.panel).toBeVisible()
      await expect(terminal.input).toBeFocused()
    })

    test('Escape and the close button both close it', async ({ page, terminal }) => {
      await terminal.open()
      await terminal.close()

      await terminal.open()
      await page.getByRole('button', { name: /close terminal/i }).click()
      await expect(terminal.panel).toBeHidden()
    })

    test('a backtick typed into a form field is a backtick', async ({ page, terminal }) => {
      // The shortcut is bound at the window, so without the typing-target guard it
      // would eat every backtick anyone types into the contact form.
      const field = page.locator('#contact input, #contact textarea').first()
      await field.click()
      await field.press('`')

      await expect(terminal.panel).toBeHidden()
      await expect(field).toHaveValue('`')

      // Ctrl+` is the deliberate escape hatch that still works from inside a field.
      await field.press('Control+`')
      await expect(terminal.panel).toBeVisible()
    })
  })

  test.describe('the shell loop', () => {
    test('help lists commands and an unknown one is reported, not swallowed', async ({
      terminal,
    }) => {
      await terminal.open()
      await terminal.run('help')
      await terminal.expectOutput('whoami')

      await terminal.run('definitelynotacommand')
      await terminal.expectOutput('command not found')
    })

    test('Tab completes a unique prefix and lists an ambiguous one', async ({ terminal }) => {
      await terminal.open()

      await terminal.input.fill('whoa')
      await terminal.input.press('Tab')
      // Completed *and* a trailing space: a unique match is finished, so the caret
      // is already where an argument would go.
      await expect(terminal.input).toHaveValue('whoami ')

      // An ambiguous prefix must not guess. The shell advances to the longest common
      // prefix and leaves the choice open — which prefix is ambiguous is the
      // registry's business, tested in jsdom; what matters here is that the input
      // still ends mid-word, with no space appended.
      await terminal.input.fill('ga')
      await terminal.input.press('Tab')
      await expect(terminal.input).toHaveValue(/^ga\S*$/)
    })

    test('history walks with the arrows and survives a reload', async ({
      page,
      app,
      terminal,
    }) => {
      await terminal.open()
      await terminal.run('whoami')
      await terminal.run('date')

      await terminal.input.press('ArrowUp')
      await expect(terminal.input).toHaveValue('date')
      await terminal.input.press('ArrowUp')
      await expect(terminal.input).toHaveValue('whoami')
      await terminal.input.press('ArrowDown')
      await expect(terminal.input).toHaveValue('date')

      expect(await app.readJson<string[]>('history')).toEqual(['whoami', 'date'])

      await page.reload()
      await terminal.open()
      await terminal.input.press('ArrowUp')
      await expect(terminal.input).toHaveValue('date')
    })

    test('Ctrl+L clears the scrollback', async ({ terminal }) => {
      await terminal.open()
      await terminal.run('whoami')
      await terminal.expectOutput(profile.handle)

      await terminal.input.press('Control+l')
      await expect(terminal.output).not.toContainText(profile.handle)
    })
  })

  test.describe('crossing into the page', () => {
    test('cd scrolls the real document', async ({ page, terminal }) => {
      await terminal.open()
      await terminal.run('cd contact')

      // `navigate` is a CommandContext capability that unit tests stub out. Here it
      // has to move an actual viewport — and then get out of the way, since a
      // terminal still covering the section you just asked to see is not navigation.
      await expect(page.locator('#contact')).toBeInViewport()
      await expect(terminal.panel).toBeHidden()
    })

    test('lang switches the whole UI, not just the terminal', async ({ page, terminal }) => {
      await terminal.open()
      await terminal.run('lang fr')

      await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
    })
  })

  test.describe('interrupting', () => {
    test('Ctrl+C aborts a captured command and returns the prompt', async ({ terminal }) => {
      await terminal.open()
      await terminal.run('snake')

      // A capture leaves the input `readonly` rather than `disabled`, so it keeps
      // focus and keeps receiving keydown — which is what makes Ctrl+C reachable.
      await expect(terminal.input).toHaveAttribute('readonly', '')
      await terminal.input.press('Control+c')

      await expect(terminal.input).not.toHaveAttribute('readonly', '')
      await terminal.run('whoami')
      await terminal.expectOutput(profile.handle)
    })

    test('Escape also releases a capture without closing the terminal', async ({ terminal }) => {
      await terminal.open()
      await terminal.run('snake')
      await expect(terminal.input).toHaveAttribute('readonly', '')

      await terminal.input.press('Escape')

      // Quitting a game must not also dismiss the terminal — and the capture is
      // released whatever happens, because a capture that outlives its command reads
      // as a frozen terminal that no amount of typing gets you out of.
      await expect(terminal.panel).toBeVisible()
      await expect(terminal.input).not.toHaveAttribute('readonly', '')
      await terminal.run('whoami')
      await terminal.expectOutput(profile.handle)
    })

    /**
     * A command that holds no capture — `ask`, `ping`, anything that just awaits —
     * used to leave the input `disabled` for the duration. A disabled input cannot
     * hold focus: about a frame later the browser moves `document.activeElement` to
     * `<body>`, outside the panel, and Ctrl+C lands on nothing while the command runs
     * to completion. The input is now `readonly` + `aria-disabled` instead, as it
     * already was under a capture, so it keeps focus the whole time.
     *
     * The old version of this test, marked `test.fail()`, raced `ping` and usually
     * *passed*. Its Ctrl+C went out a few milliseconds after Enter, before the
     * browser had moved focus off the just-disabled input, so the key still reached
     * the handler. That is why this one holds the command open on a request that
     * never answers, and lets a couple of frames pass before touching the keyboard.
     */
    test('Ctrl+C aborts an in-flight command that holds no capture', async ({
      api,
      page,
      terminal,
    }) => {
      api.any('/ask', () => new Promise<void>(() => {}))

      await terminal.open()
      await terminal.input.fill('ask who are you')
      await terminal.input.press('Enter')
      await terminal.expectOutput('thinking')
      await expect(terminal.input).toBeDisabled()

      await page.evaluate(
        () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
      )
      await expect(terminal.input).toBeFocused()

      // Focused but inert: readonly stops typing, and the overlay swallows the keys
      // that would otherwise submit a second line or write history/completions into
      // the input.
      for (const key of ['x', 'Tab', 'ArrowUp', 'Enter']) await page.keyboard.press(key)
      await expect(terminal.input).toHaveValue('')

      await page.keyboard.press('Control+c')

      await terminal.expectOutput('^C')
      await expect(terminal.input).toBeEnabled()
      await expect(terminal.input).toBeFocused()
      // `ask` redraws its `thinking…` frame away as it unwinds. Had the Enter above
      // gone through, its echoed prompt line would have landed under the frame, and
      // the redraw, which replaces the buffer's last rows, would have removed that
      // line instead, leaving `thinking…` stuck in the scrollback.
      await expect(terminal.output).not.toContainText('thinking')
    })
  })
})
