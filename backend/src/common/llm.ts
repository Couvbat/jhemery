import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The self-hosted model, as `ask` and the guestbook's moderator share it
 * (`docs/superpowers/specs/2026-10-15-guestbook-moderation-design.md`, *The shared slot*):
 * one OpenAI-compatible client, and one slot.
 *
 * **One slot.** Self-hosted inference serialises anyway, so a queue would only let
 * callers pile up work on someone's GPU. A visitor's question takes the slot or is told
 * at once that someone else is asking (`tryAcquire`). The moderator is a background
 * caller: it waits until the slot is free *and* no detached warm-up is running
 * (`acquire`), and gives the slot back after each call, about a second at 60 tokens. A
 * visitor who asks during one gets the busy line, which is rare enough to accept and
 * keeps the slot a single, simple rule.
 */

/** Gives the slot back. Calling it twice is harmless. */
export type Release = () => void;

@Injectable()
export class LlmService {
  private held = false;
  /**
   * A detached request still bringing the model up. While one exists a visitor is told
   * the model is waking rather than dialling again, and the moderator waits.
   */
  private warmUp: Promise<unknown> | null = null;
  private waiters: Array<() => void> = [];

  constructor(private readonly config: ConfigService) {}

  /** A URL and a model: what both callers need before anything else. */
  get configured(): boolean {
    return Boolean(
      this.config.get<string>('LLM_BASE_URL') &&
      this.config.get<string>('LLM_MODEL'),
    );
  }

  get model(): string {
    return this.config.get<string>('LLM_MODEL') ?? '';
  }

  get warming(): boolean {
    return this.warmUp !== null;
  }

  /** The slot now, or null when it is taken. Claimed synchronously, so two callers can't both see it free. */
  tryAcquire(): Release | null {
    if (this.held) return null;
    this.held = true;
    return this.releaser();
  }

  /**
   * The slot once it is free and nothing is warming up, for a caller with no visitor
   * waiting on it. Rejects on `signal`.
   */
  acquire(
    _options: { background: true },
    signal?: AbortSignal,
  ): Promise<Release> {
    return new Promise<Release>((resolve, reject) => {
      const attempt = () => {
        if (signal?.aborted) {
          reject(new Error('aborted'));
          return true;
        }
        if (this.held || this.warmUp) return false;
        this.held = true;
        resolve(this.releaser());
        return true;
      };
      if (attempt()) return;
      const waiter = () => {
        if (attempt()) this.waiters = this.waiters.filter((w) => w !== waiter);
      };
      this.waiters.push(waiter);
      signal?.addEventListener('abort', waiter, { once: true });
    });
  }

  /**
   * Registers a detached request that is finishing a model load. The slot itself is
   * free meanwhile: visitors are turned away by `warming`, the moderator waits for it.
   */
  warmingUntil(work: Promise<unknown>): void {
    const settled = work
      .catch(() => undefined)
      .finally(() => {
        if (this.warmUp === settled) this.warmUp = null;
        this.wake();
      });
    this.warmUp = settled;
  }

  private releaser(): Release {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held = false;
      this.wake();
    };
  }

  private wake(): void {
    for (const waiter of [...this.waiters]) waiter();
  }

  /** `POST {LLM_BASE_URL}/chat/completions`, with the key when there is one. */
  post(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const baseUrl = this.config.get<string>('LLM_BASE_URL') ?? '';
    const apiKey = this.config.get<string>('LLM_API_KEY');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    return fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({ model: this.model, ...body }),
    });
  }

  /**
   * One short, whole answer, not streamed: the moderator's verdicts and replies. The
   * thinking a reasoning model inlines is dropped, as in `ask`.
   */
  async complete(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<string> {
    const res = await this.post(
      { stream: false, reasoning_effort: 'none', ...body },
      signal,
    );
    if (!res.ok) throw new Error(`The model answered ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const visible = stripThinking();
    const content = data.choices?.[0]?.message?.content ?? '';
    return (visible.push(content) + visible.flush()).trim();
  }
}

/** One `data:` event of a streamed completion: some of the answer, the token count, or both. */
export interface StreamEvent {
  delta?: string;
  outputTokens?: number;
}

interface CompletionChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
  /** Sent on the last chunk when the request asked for `stream_options.include_usage`. */
  usage?: { completion_tokens?: number } | null;
}

/**
 * Reads an OpenAI-compatible `stream: true` body. Written by hand rather than
 * with `EventSource` because this is a POST, and because every runtime that
 * matters sends exactly one `data:` field per event.
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;

    buffer += decoder.decode(value, { stream: true });
    let newline: number;
    // Line by line, so an event split across two network chunks still parses.
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const raw = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!raw.startsWith('data:')) continue;

      const payload = raw.slice('data:'.length).trim();
      if (payload === '[DONE]') return;

      const event = parseEvent(payload);
      if (event) onEvent(event);
    }
  }
}

/** A malformed chunk is not worth failing a whole answer over. */
export function parseEvent(payload: string): StreamEvent | undefined {
  try {
    const chunk = JSON.parse(payload) as CompletionChunk;
    const delta = chunk.choices?.[0]?.delta?.content ?? undefined;
    const tokens = chunk.usage?.completion_tokens;
    return {
      ...(delta ? { delta } : {}),
      ...(typeof tokens === 'number' ? { outputTokens: tokens } : {}),
    };
  } catch {
    return undefined;
  }
}

const THINK_OPEN = '<think>';
const THINK_CLOSE = '</think>';

/**
 * Drops `<think>…</think>` from the visible answer.
 *
 * Reasoning models leak deliberation two ways. Ollama puts it in a separate
 * `reasoning` field, which nothing here ever reads; llama.cpp and friends inline
 * it in `content`. `reasoning_effort: 'none'` turns both off where it is honoured,
 * and this covers the runtimes that ignore it — nobody wants a thousand characters
 * of the model talking itself through the answer.
 *
 * Stateful because a tag can be split across two chunks, so the tail of each
 * chunk is held back until it is known not to be the start of one. `flush()`
 * releases whatever survived once the stream ends.
 */
export function stripThinking(): {
  push(chunk: string): string;
  flush(): string;
} {
  let buffer = '';
  let inside = false;

  return {
    push(chunk: string): string {
      buffer += chunk;
      let out = '';

      for (;;) {
        if (inside) {
          const end = buffer.indexOf(THINK_CLOSE);
          if (end === -1) {
            // Keep only enough to recognise a closing tag split across chunks.
            buffer = buffer.slice(
              Math.max(0, buffer.length - THINK_CLOSE.length + 1),
            );
            return out;
          }
          buffer = buffer.slice(end + THINK_CLOSE.length);
          inside = false;
          continue;
        }

        const start = buffer.indexOf(THINK_OPEN);
        if (start === -1) {
          const safe = Math.max(0, buffer.length - THINK_OPEN.length + 1);
          out += buffer.slice(0, safe);
          buffer = buffer.slice(safe);
          return out;
        }
        out += buffer.slice(0, start);
        buffer = buffer.slice(start + THINK_OPEN.length);
        inside = true;
      }
    },
    /** An unterminated `<think>` means everything after it was deliberation. */
    flush(): string {
      if (inside) return '';
      const rest = buffer;
      buffer = '';
      return rest;
    },
  };
}
