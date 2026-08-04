import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, askStream } from '@/lib/api'

/**
 * The wire format between `/ask` and the terminal. Everything here is about
 * failures arriving in the two different places they can: as a status code
 * before the stream starts, or as an event once the backend has already
 * committed to a 200 and can no longer send one.
 */
describe('askStream', () => {
  function body(...chunks: string[]): Response {
    const encoder = new TextEncoder()
    return {
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
          controller.close()
        },
      }),
    } as unknown as Response
  }

  function event(payload: unknown): string {
    return `data: ${JSON.stringify(payload)}\n\n`
  }

  /** Answers the next `fetch` with `res`, then reads the stream to the end. */
  async function drain(res: Response): Promise<string[]> {
    global.fetch = vi.fn().mockResolvedValue(res)
    const deltas: string[] = []
    for await (const delta of askStream('does he know Rust?', 'en')) deltas.push(delta)
    return deltas
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('yields each delta and stops at [DONE]', async () => {
    const res = body(event({ delta: 'Yes' }), event({ delta: ', he does.' }), 'data: [DONE]\n\n')

    await expect(drain(res)).resolves.toEqual(['Yes', ', he does.'])
  })

  it('parses an event split across two network chunks', async () => {
    const whole = event({ delta: 'Yes, he does.' })
    const res = body(whole.slice(0, 12), whole.slice(12), 'data: [DONE]\n\n')

    await expect(drain(res)).resolves.toEqual(['Yes, he does.'])
  })

  it('raises a status code for a failure that arrives before the stream', async () => {
    const res = {
      ok: false,
      status: 502,
      json: () => Promise.resolve({ message: 'The model is unavailable' }),
    } as unknown as Response

    await expect(drain(res)).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
    })
  })

  /**
   * The backend's silence ceiling: once it has written a 200 to beat the proxy's
   * timeout, "the model never woke up" can only be said in-band. It has to reach
   * `ask` as the same kind of error a 502 would have been, or the terminal draws
   * an empty answer instead of the degraded line.
   */
  it('raises an in-band error as a 502, the same as an unreachable model', async () => {
    const res = body(event({ error: 'asleep' }), 'data: [DONE]\n\n')

    const failure = await drain(res).catch((err: unknown) => err)
    expect(failure).toBeInstanceOf(ApiError)
    expect((failure as ApiError).status).toBe(502)
  })

  it('keeps the busy case distinguishable in-band, because the advice differs', async () => {
    const res = body(event({ error: 'busy' }), 'data: [DONE]\n\n')

    const failure = await drain(res).catch((err: unknown) => err)
    expect((failure as ApiError).status).toBe(503)
  })

  it('skips a malformed chunk rather than throwing the answer away', async () => {
    const res = body(
      event({ delta: 'Yes' }),
      'data: {not json\n\n',
      event({ delta: ' he does.' }),
      'data: [DONE]\n\n',
    )

    await expect(drain(res)).resolves.toEqual(['Yes', ' he does.'])
  })
})
