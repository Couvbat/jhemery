import { expect, test } from './fixtures'
import { messages } from '@/i18n/messages'

/**
 * The two places a visitor sends something to the server.
 *
 * Nothing here reaches a real endpoint — every assertion about "it sent the right
 * thing" is made against the *intercepted request*, not against a mailbox. That is
 * also the only way to test the failure paths: a rate limit and an SMTP outage are
 * states a healthy backend will not produce on demand.
 */

const VALID = {
  name: 'E2E Tester',
  email: 'tester@example.invalid',
  subject: 'Hello there',
  message: 'This message was never actually sent anywhere.',
}

async function fillContactForm(
  page: import('@playwright/test').Page,
  values: Partial<typeof VALID> = {},
) {
  const filled = { ...VALID, ...values }
  await page.locator('#name').fill(filled.name)
  await page.locator('#email').fill(filled.email)
  await page.locator('#subject').fill(filled.subject)
  await page.locator('#message').fill(filled.message)
}

test.describe('contact form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('a valid message posts exactly what was typed', async ({ page, api }) => {
    api.post('/contact', { ok: true })
    await fillContactForm(page)
    await page.getByRole('button', { name: messages.contact.send.en }).click()

    await expect(page.locator('#contact')).toContainText(messages.contact.success.en)

    const [sent] = api.sent('POST', '/contact')
    expect(sent!.body).toEqual(VALID)

    // The form empties itself on success, so a double-click on a flaky connection
    // cannot quietly send the same message twice.
    await expect(page.locator('#message')).toHaveValue('')
  })

  test('an empty required field is refused before anything is sent', async ({ page, api }) => {
    await fillContactForm(page, { message: '' })
    await page.getByRole('button', { name: messages.contact.send.en }).click()

    // Native `required` stops the submit, so the guard is invisible — which is the
    // point. Nothing reached the network at all.
    expect(api.sent('POST', '/contact')).toHaveLength(0)
    await expect(page.locator('#contact')).not.toContainText(messages.contact.success.en)
  })

  test('a malformed address never reaches the server', async ({ page, api }) => {
    await fillContactForm(page, { email: 'not-an-address' })
    await page.getByRole('button', { name: messages.contact.send.en }).click()

    expect(api.sent('POST', '/contact')).toHaveLength(0)
  })

  test('a rate limit is reported with the server’s own reason', async ({ page, api }) => {
    api.fail('POST', '/contact', 429, 'too many messages, try again later')
    await fillContactForm(page)
    await page.getByRole('button', { name: messages.contact.send.en }).click()

    const section = page.locator('#contact')
    await expect(section).toContainText(messages.contact.error.en)
    // The detail line matters: "failed to send" alone leaves someone retrying into
    // the same wall, and the backend already said why.
    await expect(section).toContainText('too many messages')
  })

  test('a server error keeps what was typed', async ({ page, api }) => {
    api.fail('POST', '/contact', 500)
    await fillContactForm(page)
    await page.getByRole('button', { name: messages.contact.send.en }).click()

    await expect(page.locator('#contact')).toContainText(messages.contact.error.en)
    // Losing a written message to a 500 is the one unforgivable failure here.
    await expect(page.locator('#message')).toHaveValue(VALID.message)
  })
})

test.describe('through the terminal', () => {
  test.skip(
    () => test.info().project.name === 'mobile',
    'There is deliberately no terminal on a phone.',
  )

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('mail walks through prompts and sends the composed message', async ({ api, terminal }) => {
    api.post('/contact', { ok: true })

    await terminal.open()
    await terminal.input.fill('mail')
    await terminal.input.press('Enter')

    // Each prompt is answered into the same input — `prompt()` holds the line rather
    // than opening anything new.
    for (const answer of [VALID.name, VALID.email, VALID.subject, VALID.message]) {
      await expect(terminal.input).toBeEnabled()
      await terminal.input.fill(answer)
      await terminal.input.press('Enter')
    }

    // A preview and an explicit confirmation before anything is sent.
    await terminal.expectOutput('─ preview')
    await terminal.expectOutput(VALID.message)
    expect(api.sent('POST', '/contact')).toHaveLength(0)

    await terminal.input.fill('y')
    await terminal.input.press('Enter')

    await terminal.expectOutput('✓ sent')
    const [sent] = api.sent('POST', '/contact')
    expect(sent!.body).toEqual(VALID)
  })

  test('answering anything but yes sends nothing', async ({ api, terminal }) => {
    await terminal.open()
    await terminal.input.fill('mail')
    await terminal.input.press('Enter')

    for (const answer of [VALID.name, VALID.email, VALID.subject, VALID.message, 'n']) {
      await expect(terminal.input).toBeEnabled()
      await terminal.input.fill(answer)
      await terminal.input.press('Enter')
    }

    await terminal.expectOutput('aborted — nothing was sent')
    expect(api.sent('POST', '/contact')).toHaveLength(0)
  })

  test('a bad address is caught before the composition finishes', async ({ api, terminal }) => {
    await terminal.open()
    await terminal.input.fill('mail')
    await terminal.input.press('Enter')

    for (const answer of [VALID.name, 'not-an-address']) {
      await expect(terminal.input).toBeEnabled()
      await terminal.input.fill(answer)
      await terminal.input.press('Enter')
    }

    await terminal.expectOutput('is not a valid address')
    expect(api.sent('POST', '/contact')).toHaveLength(0)
  })

  test('sign posts a guestbook entry and reports the server’s refusal', async ({
    api,
    terminal,
  }) => {
    api.post('/guestbook', {
      id: 'new-entry',
      name: 'E2E',
      message: 'hello',
      date: '2026-08-08T10:00:00.000Z',
    })

    await terminal.open()
    await terminal.input.fill('sign hello')
    await terminal.input.press('Enter')

    // `sign` takes the message as an argument and prompts only for the name.
    await expect(terminal.input).toBeEnabled()
    await terminal.input.fill('E2E')
    await terminal.input.press('Enter')

    await terminal.expectOutput('✓ signed')
    expect(api.sent('POST', '/guestbook')[0]!.body).toEqual({ name: 'E2E', message: 'hello' })

    // And the refusal path — the guestbook is rate-limited and moderated, so being
    // told why is the difference between "try again" and "stop trying".
    api.fail('POST', '/guestbook', 429, 'one entry per hour')
    await terminal.input.fill('sign again')
    await terminal.input.press('Enter')
    await expect(terminal.input).toBeEnabled()
    await terminal.input.fill('E2E')
    await terminal.input.press('Enter')

    await terminal.expectOutput('one entry per hour')
  })
})
