import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AskDto } from './ask.dto';
import { UnitHealth } from '../common/health';
import { LlmService, readEventStream, stripThinking } from '../common/llm';
import { LabService } from '../lab/lab.service';
import { McpContentService } from '../mcp/mcp.content';
import { AskCorpusService } from './ask.corpus';
import { labBrief } from './lab-brief';
import { systemPrompt } from './prompt';
import { askFailure, classify, reasonOf, type AskReason } from './ask.failure';

/**
 * The corpus is the site's published summary, `${FRONTEND_URL}/llms.txt`, which
 * already exists for exactly this audience. It is the same origin the MCP endpoint
 * reads `content.json` from, so a local or staging install answers from its own
 * copy rather than production's. Fetched over HTTP rather than imported, so the two
 * apps deploy independently. The frontend build generates it from the content
 * (`frontend/vite-plugins/discovery.ts`), so its lists follow the tools, the case
 * studies and the notes.
 */
const CORPUS_TTL_MS = 60 * 60 * 1000;
const CORPUS_TIMEOUT_MS = 5_000;
/**
 * How long to sit on the fallback after a failed refresh. Without this, a host
 * that hangs rather than refusing gets re-dialled on every single question.
 */
const CORPUS_RETRY_MS = 5 * 60 * 1000;
/** The whole corpus is a couple of kilobytes; this only guards against a surprise. */
const MAX_CORPUS_CHARS = 16_000;

/** Terminal answers should be short. This also caps the cost of any one request. */
const MAX_OUTPUT_TOKENS = 300;

/**
 * How long a visitor waits for the first token before being told the model is
 * asleep. Reaching it stops the *waiting*, never the request — see `stream()`.
 */
const FIRST_TOKEN_TIMEOUT_MS = 20_000;
/**
 * Longest silence mid-answer before the model counts as hung. Once tokens are
 * flowing they arrive milliseconds apart, so a gap this size is a dead stream,
 * not a slow one.
 */
const IDLE_TIMEOUT_MS = 15_000;
/**
 * Hard ceiling on a detached warm-up. Generous, because it is racing a model
 * load off disk; it exists only so a wedged upstream cannot leak forever.
 */
const WARMUP_CEILING_MS = 5 * 60_000;

/** Keeps `ask` alive when the frontend is down, rather than taking it with it. */
const FALLBACK_CORPUS = `# Jules Hémery (Couvbat)

Full-Stack Developer at In-Leed, France. Builds web apps, produces hard electronic music
(hardcore, techno, acidcore), and tinkers with AI and self-hosted hardware on the side.

- Site: https://jhemery.xyz
- GitHub: https://github.com/Couvbat
- SoundCloud: https://soundcloud.com/couvbat

The site's own terminal has a \`mail\` command that reaches him directly.`;

/**
 * Which model wrote the answer, how fast, and from which of the site's pages
 * (`docs/superpowers/specs/2026-10-15-ask-my-lab-design.md` §3). Sent as one event after
 * the last delta and before `[DONE]`.
 */
export interface AskMeta {
  /** `LLM_MODEL`. */
  model: string;
  /** `LLM_HOST_LABEL`: public text the owner writes, never derived from `LLM_BASE_URL`. */
  label?: string;
  outputTokens: number;
  /** The runtime sent no usage, so `outputTokens` counts deltas instead. */
  approx?: true;
  firstTokenMs: number;
  totalMs: number;
  /** Output tokens over the time after the first token, so a cold load doesn't make a fast model look slow. */
  tokensPerSecond: number | null;
  /** The passages the API gave the model, best first, at most three: from retrieval, never from the model's text. */
  sources: Array<{ title: string; target: string }>;
}

/** At most this many sources go out with an answer. */
const MAX_SOURCES = 3;

/**
 * How a question ended, for the controller: an answer and its meta, or a stream that
 * closed without one, which keeps its 200 (the status was sent before anyone knew) and
 * says so in-stream.
 */
export interface AskAnswer {
  empty: boolean;
  meta?: AskMeta;
}

/** What `stream()` hands back: how many deltas went out, and the meta for them. */
interface Streamed {
  delivered: number;
  meta: AskMeta;
}

/** What `/health` reports of the last real question: its outcome and when. */
export type AskOutcome = 'ok' | AskReason;

@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);
  private corpus: { text: string; expiresAt: number } | null = null;
  /** At most one corpus refresh in flight, so questions cannot pile up dials. */
  private corpusRefresh: Promise<void> | null = null;
  /**
   * The last real question's outcome and the counts since the process started, which
   * `/health` reports. A busy refusal isn't recorded: the question holding the slot
   * will be, and that is the one that says how the model is.
   */
  private last: { outcome: AskOutcome; at: number } | null = null;
  private outcomes = { ok: 0, failed: 0 };

  /**
   * The first tier's `content.json` comes from the MCP endpoint's own copy rather than a
   * second fetch, and the passages from `AskCorpusService`; both are read from what is in
   * hand, never awaited. Optional, so a service built without them answers from
   * `llms.txt` alone, as it did before either existed.
   */
  /**
   * The model and its one slot, shared with the guestbook's moderator (`common/llm.ts`).
   * The cap lives there rather than in `RateLimitGuard` because that guard is per-IP by
   * construction. A service built without one gets its own, as it did before the slot
   * was shared.
   */
  private readonly llm: LlmService;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly content?: McpContentService,
    @Optional() private readonly passages?: AskCorpusService,
    @Optional() private readonly lab?: LabService,
    @Optional() llm?: LlmService,
  ) {
    this.llm = llm ?? new LlmService(config);
  }

  /**
   * The lab as it is now, for the prompt's `LAB NOW` block. The same process holds the
   * snapshot, so this is a function call: no HTTP and no loopback. Nothing with the lab
   * off or nothing pushed yet, and nothing rather than a failure if reading it throws.
   */
  private async labNow(): Promise<string | null> {
    try {
      return labBrief(await this.lab?.report());
    } catch {
      return null;
    }
  }

  /**
   * Off by default: this is a public endpoint that spends a private machine's
   * electricity, so it has to be opted into the same way the guestbook is.
   */
  get enabled(): boolean {
    return (
      this.config.get<string>('ASK_ENABLED') === 'true' && this.llm.configured
    );
  }

  /**
   * Streams the model's answer through `onDelta`. Throws before the first delta
   * when the model is off, busy or unreachable, so the controller can still
   * answer with a real status code instead of a half-written stream.
   *
   * `signal` is the client's disconnect: there is no point holding the slot for
   * a browser tab that has already gone.
   */
  async answer(
    dto: AskDto,
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<AskAnswer> {
    // Claimed synchronously, before the first `await`, so two overlapping
    // requests cannot both see a free slot.
    const release = this.llm.tryAcquire();
    if (!release) {
      throw askFailure(classify({ kind: 'busy' }), 'One question at a time');
    }
    if (!this.enabled) {
      release();
      // The same status as an unreachable model, so an older frontend still has one
      // degraded path; the reason tells a newer one which.
      throw askFailure(
        classify({ kind: 'disabled' }),
        'The model is unavailable',
      );
    }
    if (this.llm.warming) {
      release();
      // Still loading from an earlier question. Say so immediately instead of
      // queueing a second load behind the first.
      const failure = askFailure(
        classify({ kind: 'warming' }),
        'The model is still waking up',
      );
      this.failed(failure, 0);
      throw failure;
    }

    const startedAt = Date.now();
    try {
      const { delivered, meta } = await this.stream(dto, onDelta, signal);
      if (delivered === 0) {
        this.failed(
          askFailure(
            classify({ kind: 'empty' }),
            'The stream ended without an answer',
          ),
          Date.now() - startedAt,
        );
        return { empty: true };
      }
      // Latency and outcome only — never the question, the answer or the IP.
      // There is no value in a transcript of what strangers asked, and keeping
      // one turns a toy into a privacy obligation.
      this.logger.log(
        `ask ok in ${Date.now() - startedAt}ms (${delivered} chunks)`,
      );
      this.record('ok');
      return { empty: false, meta };
    } catch (err) {
      this.failed(err, Date.now() - startedAt);
      throw err;
    } finally {
      release();
    }
  }

  /**
   * The controller's silence ceiling answered for this service: nothing else will say
   * so, since the service may still be waiting on whatever wedged.
   */
  recordSilent(afterMs: number): void {
    this.failed(
      askFailure(classify({ kind: 'ceiling' }), 'Nothing came in time'),
      afterMs,
    );
  }

  /**
   * The log line leads with the reason, then the upstream's own words:
   * `ask failed after 812ms: refused (The model answered 403)`. Still no question,
   * answer or address.
   */
  private failed(err: unknown, afterMs: number): void {
    const reason = reasonOf(err) ?? classify({ kind: 'thrown', error: err });
    const detail = err instanceof Error ? err.message : String(err);
    this.logger.warn(`ask failed after ${afterMs}ms: ${reason} (${detail})`);
    this.record(reason);
  }

  private record(outcome: AskOutcome): void {
    this.last = { outcome, at: Date.now() };
    if (outcome === 'ok') this.outcomes.ok += 1;
    else this.outcomes.failed += 1;
  }

  /**
   * Returns how many deltas made it out, and the meta that goes with them.
   *
   * **Giving up waiting is not the same as cancelling.** Ollama aborts a model
   * load the moment its client disconnects:
   *
   * ```
   * client connection closed before llama-server finished loading, aborting load
   * Load failed … error="timed out waiting for llama-server to start: context canceled"
   * ```
   *
   * A cold load of this model measures ~34s against a 20s deadline, so an
   * aborting timeout killed the very load that would have made the next
   * question fast — every visitor restarted it from nothing and no visitor ever
   * got an answer. Keeping the model warm cannot fix that on its own, because
   * it never finishes loading in the first place.
   *
   * So the deadline detaches instead: the visitor is told the model is asleep,
   * which is true, while the request runs on in the background until the load
   * completes and the model goes resident. The next question — a visitor or two
   * later — gets a real answer in about a second. The upstream is only ever
   * aborted by a genuine fault: silence mid-answer, or the hard ceiling.
   */
  private async stream(
    dto: AskDto,
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ): Promise<Streamed> {
    const startedAt = Date.now();
    const model = this.llm.model;
    const corpus = this.corpusNow();
    const labNow = await this.labNow();
    // Once, so the passages the model was given are exactly the sources it is credited with.
    const passages = this.passages?.passagesFor(dto.question, dto.locale) ?? [];
    let firstAt: number | null = null;
    let usage: number | undefined;

    const controller = new AbortController();
    const ceiling = setTimeout(() => controller.abort(), WARMUP_CEILING_MS);

    let delivered = 0;
    let detached = false;
    let idle: ReturnType<typeof setTimeout> | null = null;
    let onFirstToken!: () => void;
    const firstToken = new Promise<void>((resolve) => {
      onFirstToken = resolve;
    });

    // A visitor who closes the tab stops being written to, but their request
    // still finishes warming the model. Aborting here would cancel the load for
    // everyone behind them — and a 34s wait is exactly when tabs get closed.
    const onClientGone = () => {
      detached = true;
    };
    signal?.addEventListener('abort', onClientGone, { once: true });

    const visible = stripThinking();
    const emit = (text: string) => {
      if (!text) return;
      // Once tokens flow they arrive milliseconds apart, so a long gap is a
      // dead stream rather than a slow one. This is the only clock that may
      // abort, and it cannot fire during a load.
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);

      delivered += 1;
      firstAt ??= Date.now();
      onFirstToken();
      // A detached run is only here to finish warming the model; the visitor
      // it started for has already been answered.
      if (!detached) onDelta(text);
    };

    const work = (async () => {
      const res = await this.llm.post(
        {
          stream: true,
          max_tokens: MAX_OUTPUT_TOKENS,
          // A reasoning model spends the whole token budget deliberating and
          // then gets cut off mid-answer: `gemma4:e4b` burns ~250 of 300 on
          // chain-of-thought and finishes `length`, not `stop`. Runtimes that
          // do not know the field ignore it.
          reasoning_effort: 'none',
          // The runtime's own token count, on the last chunk. A runtime that ignores
          // the option is counted by its deltas instead, and the meta says so.
          stream_options: { include_usage: true },
          messages: [
            {
              role: 'system',
              content: systemPrompt({
                corpus,
                content: this.content?.current() ?? null,
                passages,
                labNow,
                locale: dto.locale,
              }),
            },
            { role: 'user', content: dto.question },
          ],
        },
        controller.signal,
      );

      if (!res.ok || !res.body) {
        throw askFailure(
          classify({ kind: 'status', status: res.status }),
          `The model answered ${res.status}`,
        );
      }

      await readEventStream(res.body, (event) => {
        if (event.delta) emit(visible.push(event.delta));
        if (event.outputTokens !== undefined) usage = event.outputTokens;
      });
      emit(visible.flush());
    })();

    const meta = (): AskMeta => {
      const end = Date.now();
      const outputTokens = usage ?? delivered;
      const generating = firstAt === null ? 0 : (end - firstAt) / 1000;
      const label = this.config.get<string>('LLM_HOST_LABEL')?.trim();
      return {
        model,
        ...(label ? { label } : {}),
        outputTokens,
        ...(usage === undefined ? { approx: true as const } : {}),
        firstTokenMs: (firstAt ?? end) - startedAt,
        totalMs: end - startedAt,
        tokensPerSecond:
          generating > 0
            ? Math.round((outputTokens / generating) * 10) / 10
            : null,
        sources: passages.slice(0, MAX_SOURCES).map((passage) => ({
          title: passage.title,
          target: passage.passage.target,
        })),
      };
    };

    const gaveUp = Symbol('deadline');
    let deadline: ReturnType<typeof setTimeout> | null = null;

    try {
      const raced = await Promise.race([
        work.then(() => undefined),
        firstToken.then(() => undefined),
        new Promise<symbol>((resolve) => {
          deadline = setTimeout(() => resolve(gaveUp), FIRST_TOKEN_TIMEOUT_MS);
        }),
      ]);

      if (raced === gaveUp && delivered === 0) {
        // Detach. Deliberately no `controller.abort()` — that is the line that
        // used to cancel the load.
        detached = true;
        this.llm.warmingUntil(
          work.finally(() => {
            if (idle) clearTimeout(idle);
            clearTimeout(ceiling);
          }),
        );
        this.logger.log(
          'ask: model still loading, detaching so the load can finish',
        );
        throw askFailure(
          classify({ kind: 'deadline' }),
          'The model is still waking up',
        );
      }

      await work;
      return { delivered, meta: meta() };
    } catch (err) {
      if (detached) throw err;
      // A fault mid-answer is not worth throwing away what the visitor already
      // has on screen — including the few characters the thinking filter is
      // sitting on, which would otherwise be truncated off the end.
      if (delivered > 0) {
        emit(visible.flush());
        return { delivered, meta: meta() };
      }
      if (reasonOf(err)) throw err;
      throw askFailure(
        classify({ kind: 'thrown', error: err }),
        `The model is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      if (deadline) clearTimeout(deadline);
      signal?.removeEventListener('abort', onClientGone);
      // A detached run owns its own cleanup; clearing here would disarm the
      // ceiling that is the only thing bounding it.
      if (!detached) {
        if (idle) clearTimeout(idle);
        clearTimeout(ceiling);
      }
    }
  }

  /**
   * The corpus never blocks an answer.
   *
   * This used to `await` the fetch on the request path, which quietly made every
   * answer depend on the backend reaching the *frontend* over HTTP. In
   * production that is a loopback — the box resolving its own domain back to
   * itself through Apache — and when it wedges it takes the whole endpoint with
   * it: no corpus, no model call, no response, not even a timeout. Observed
   * live as a request that hung indefinitely while the model was never
   * contacted at all.
   *
   * So the refresh runs in the background and the question is answered from
   * whatever is already in hand: the cached copy, a stale copy, or the baked-in
   * fallback. The cost is that the first question after a restart is answered
   * from the fallback; the benefit is that a second deploy unit can never again
   * hang this one.
   */
  private corpusNow(): string {
    if (!this.corpus || this.corpus.expiresAt <= Date.now()) {
      void this.refreshCorpus();
    }
    return this.corpus?.text ?? FALLBACK_CORPUS;
  }

  /** `${FRONTEND_URL}/llms.txt`, or null when there is nowhere to read it from. */
  private get corpusUrl(): string | null {
    const base = this.config.get<string>('FRONTEND_URL')?.replace(/\/+$/, '');
    return base ? `${base}/llms.txt` : null;
  }

  /**
   * Same fetch-and-cache shape as `github.service.ts` and `steam.service.ts`,
   * but off the request path. A failure parks the fallback for `CORPUS_RETRY_MS`
   * rather than leaving the cache empty, so a wedged host is dialled once every
   * few minutes instead of once per question.
   */
  private refreshCorpus(): Promise<void> {
    if (this.corpusRefresh) return this.corpusRefresh;

    // Nowhere to read from: answer from the fallback and don't dial anything.
    // Reaching production from a misconfigured install is the bug this guards,
    // and nothing will change until a restart, so park it for the whole TTL.
    const url = this.corpusUrl;
    if (!url) {
      if (!this.corpus) {
        this.logger.warn(
          'FRONTEND_URL is not set; ask answers from its fallback',
        );
      }
      this.corpus = {
        text: FALLBACK_CORPUS,
        expiresAt: Date.now() + CORPUS_TTL_MS,
      };
      return Promise.resolve();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CORPUS_TIMEOUT_MS);

    this.corpusRefresh = (async () => {
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'jhemery-portfolio' },
        });
        if (!res.ok) throw new Error(`llms.txt returned ${res.status}`);

        const text = (await res.text()).slice(0, MAX_CORPUS_CHARS);
        this.corpus = { text, expiresAt: Date.now() + CORPUS_TTL_MS };
      } catch (err) {
        this.logger.warn(
          `Could not refresh the ask corpus: ${err instanceof Error ? err.message : String(err)}`,
        );
        this.corpus = {
          text: this.corpus?.text ?? FALLBACK_CORPUS,
          expiresAt: Date.now() + CORPUS_RETRY_MS,
        };
      } finally {
        clearTimeout(timer);
        this.corpusRefresh = null;
      }
    })();

    return this.corpusRefresh;
  }

  /**
   * Whether `ask` is switched on — not whether the model is awake, which would take a
   * request to a machine in a flat. The terminal words "off" as the model being asleep.
   */
  health(now = Date.now()): UnitHealth {
    if (!this.enabled) {
      return { unit: 'ask', state: 'inactive', reason: 'disabled' };
    }
    // What the last real question found, never a probe of its own: `active` alone
    // only ever meant configured, which is how an outage once hid behind it.
    return {
      unit: 'ask',
      state: 'active',
      ...(this.last
        ? {
            last: {
              outcome: this.last.outcome,
              agoMs: Math.max(0, now - this.last.at),
            },
          }
        : {}),
      detail: { ...this.outcomes, passages: this.passageCount() },
    };
  }

  /** How many passages the corpus holds: 0 until it has been fetched. */
  private passageCount(): number {
    return this.passages?.size ?? 0;
  }
}
