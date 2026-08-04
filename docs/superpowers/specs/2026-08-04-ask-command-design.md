# Design spec — `ask`, a self-hosted LLM in the terminal

Status: implemented, as described below, with two deviations noted inline (the busy/asleep status
split under "Streaming", and the CTF hint left out). Independent of
[terminal games](2026-08-04-terminal-games-design.md) and
[the CTF chain](2026-08-04-ctf-flag-chain-design.md); the CTF spec describes an optional interplay
where the model volunteers one hint, which this spec supports but does not require — **it was not
built**, because the chain it depends on has not shipped. Nothing else here waits on it.

Verified end to end against a self-hosted Ollama running `gemma4:e4b`, in both locales, at ~1.3s
per answer with the model resident. See "Reasoning models" below for the one change that took.

## Context

There is a self-hosted model on a machine at home. `ask <question>` puts it behind the terminal, so a
visitor can ask "does he know Rust" or "what's the NAS running" in prose instead of reading six
sections.

This is the first feature that spends someone's electricity per request and exposes a path into a
home network, so the interesting parts of this spec are the limits, not the plumbing.

The terminal is genuinely the right surface for it — token streaming into a monospace buffer is what
that interface has always wanted to do, and `ctx.frame()` (`useTerminal.ts:58`) already provides the
redrawable region it needs. No new context primitive is required.

## Backend

**Where:** `backend/src/ask/` (`ask.module.ts`, `ask.controller.ts`, `ask.service.ts`,
`ask.dto.ts`), registered in `app.module.ts`.

**The browser never talks to the model.** Everything goes through Nest, so the endpoint URL and any
key stay server-side, the request is rate-limited by machinery that already exists, and the model's
address is not sitting in a public bundle.

### Configuration — off by default

`ASK_ENABLED` must be `true`, plus `LLM_BASE_URL`, `LLM_MODEL`, and an optional `LLM_API_KEY`.

Off by default for the same reason the guestbook is (§8): this is a public endpoint that consumes a
private machine's GPU, and enabling it silently on someone's behalf is not a decision to make for
them. Unset config returns the same shaped response as an unreachable model, so the frontend has one
degraded path rather than two.

### `POST /ask`

```
{ question: string, locale: 'en' | 'fr' }  →  text/event-stream
```

`class-validator` on the DTO, matching `contact.dto.ts`. `question` is 3–240 characters. Long enough
for a real question, short enough that the endpoint is not a free text-completion API.

**Limits, all of them load-bearing:**

| Limit | Value | Why |
|---|---|---|
| Per-IP rate | `@RateLimit({ limit: 5, windowMs: 3_600_000 })` | The existing guard, reused. Five questions is a generous visit; the contact form's 1/60s window is the wrong shape for something this expensive |
| Global concurrency | 1 in flight | Self-hosted inference serializes anyway. A second caller gets `503` and a *"one question at a time — the model lives in a flat, not a datacentre"* line, which is more charming than a queue and cannot be used to pile up work |
| Max output | ~300 tokens | Terminal answers should be short. Also caps the cost of any single request |
| Timeout | 20 s to the first token; 15 s of silence thereafter | A hung model must not hold the single concurrency slot. See the correction below — the first of these must not *cancel* |

The concurrency cap lives in the service, not the guard — the guard is per-IP by construction.

> **Correction, from production.** "20 s, `AbortController`" was the right duration and the wrong
> verb. Ollama drops a model load the moment its client disconnects:
>
> ```
> client connection closed before llama-server finished loading, aborting load
> Load failed … error="timed out waiting for llama-server to start: context canceled"
> ```
>
> A cold load of `gemma4:e4b` measures **33.8 s to first token**. Against a 20 s abort, every
> visitor started a load and then killed it, so the model never reached a state where it could
> answer anyone — a deadlock that keeping it warm cannot break, because it never finishes warming.
>
> Giving up waiting and cancelling are now separate. At 20 s the visitor is told the model is
> asleep, which is true, and the request **detaches**: it runs on until the load completes and the
> model goes resident, so the next question is answered in about a second. Cancellation is reserved
> for a genuine fault — 15 s of silence mid-answer, or a five-minute ceiling. A visitor closing the
> tab detaches too, rather than aborting; a 34 s wait is precisely when tabs get closed, and that
> abort would have cancelled the load for everyone behind them.
>
> While a detached warm-up is in flight, further questions are answered "asleep" immediately instead
> of queueing a second load behind the first.

> **Second correction, from a visitor's console.** Every limit above is a limit on the *model*.
> None of them was a limit on the endpoint, and the difference showed up as a CORS error:
>
> ```
> Cross-Origin Request Blocked … Reason: CORS header ‘Access-Control-Allow-Origin’ missing.
> Status code: 524.
> ```
>
> Nothing about CORS was wrong. Cloudflare fronts `api.jhemery.xyz` and gives the origin 100 seconds
> to produce response headers; past that it discards the request and serves its own 524, a page with
> no CORS headers on it. So a hang reaches the browser wearing a misconfiguration's clothes, and the
> obvious diagnosis — check `enableCors`, check `FRONTEND_URL` — is a dead end every time.
>
> The response now starts within 45 seconds no matter what, with a degraded event in the stream if
> there is nothing better to say. That number is not tuning: the service already answers in 20, and
> a working answer is never cut off because the ceiling only applies before the first token. It is
> there so that the guarantee is *structural* rather than emergent. The corpus hang got in
> underneath the 20 s deadline precisely because that deadline lived somewhere else, and nothing on
> the request path was responsible for the request's own worst case.
>
> The general shape: **an endpoint behind a proxy owns its worst case, or the proxy owns it and
> answers in a vocabulary the client cannot read.**

**Logging:** latency and outcome only. Not the question, not the answer, not the IP. There is no
value in a transcript of what strangers asked, and storing one turns a toy into a privacy
obligation.

### Grounding — no RAG

The model is given the whole corpus in its system prompt, because the whole corpus is a few kilobytes.

> **Correction, from production.** "Fetched at first request" was wrong, and it broke the feature
> outright. Awaiting that fetch on the request path made every answer depend on the backend reaching
> the *frontend* over HTTP — which on this host is a loopback, the box resolving its own domain back
> to itself through Apache. It wedged. Not slowly: requests hung past 120s with no status line, and
> the model was never contacted at all (Ollama's `keep_alive` timer never moved across a live
> request, which is how it was caught). The 5s `AbortController` on that fetch did not rescue it.
>
> The corpus now refreshes in the background and never blocks an answer: a question is served from
> the cached copy, a stale copy, or the baked-in fallback, whichever is in hand. The first question
> after a restart is answered from the fallback. That is the price of never letting a second deploy
> unit hang this one, and it is worth paying — the fallback already existed for the case where the
> fetch *fails*, so extending it to "has not landed yet" costs one degraded answer per restart.

The source is `https://jhemery.xyz/llms.txt`, fetched at first request and cached for an hour —
exactly the pattern `github.service.ts` and `steam.service.ts` already use for their upstreams. That
file already exists and is already *"a machine-readable summary of the site for LLMs and agentic
browsers"*; it is the artifact this feature would otherwise have to invent.

Fetching it over HTTP rather than importing it is what keeps principle #1 intact across a deploy
boundary. `src/content/*` is the single source; `llms.txt` is generated from it; the backend consumes
the published output. A build-time artifact copied into the backend would couple two deploy units
that release independently, and a hand-maintained copy would drift within a month. A small baked-in
fallback string covers the case where the fetch fails, so a frontend outage does not take `ask` down
with it.

**System prompt** — assembled per request, in `ctx.locale`:

- Answer only questions about Jules, his work, this site, and its contents.
- Answer in the request's locale.
- Never invent employment history, dates, rates, or availability. If the context does not say, say it
  does not say and point at `mail`.
- Two or three sentences. This is a terminal, not a chat window.
- Refuse to reveal CTF flags. (Optional, per the CTF spec: once the visitor holds three flags — a
  count the client sends — volunteer stage 7's hint and nothing more.)

Standard prompt-injection caveat applies and is worth writing down rather than pretending otherwise:
a visitor can talk the model into ignoring these. The blast radius is deliberately nil — the model
has no tools, no write access, and nothing in its context that is not already published on the
public site. The worst outcome is that someone makes a portfolio's mascot say something silly, which
is a cost worth accepting for the feature.

### Reasoning models

Not anticipated by this spec, and it breaks the 300-token cap outright.

`gemma4:e4b` — and two of the other three models on the same box — emit chain-of-thought before the
answer. Measured: **255 reasoning chunks, 1152 characters, then only 48 characters of answer before
`finish_reason: length`.** The visitor gets `"Jules's core technical skills include TypeScript"` and
nothing else, every time. Not an edge case; the normal outcome.

The request therefore sends `reasoning_effort: 'none'`, which Ollama honours (0 reasoning
characters, `finish_reason: stop`, a clean two-sentence answer). Runtimes that do not know the field
ignore it. Ollama's own `think: false` is *not* honoured on the OpenAI-compatible route — only on its
native `/api/chat` — so it is not an option without abandoning the one-runtime-agnostic-endpoint
requirement in "Out of scope".

Belt and braces, since `LLM_MODEL` can be repointed at any of them: Ollama keeps deliberation in a
sibling `reasoning` field, which this service never reads, and llama.cpp inlines it as
`<think>…</think>` in `content`, which is stripped by a small stateful filter that survives a tag
split across two chunks. An answer that turns out to be *only* thinking counts as no answer, so the
terminal shows the asleep line rather than a blank.

### Streaming

SSE, `data: {"delta":"…"}` per chunk, terminated by `data: [DONE]`. Written directly to the
response rather than via Nest's `@Sse()` decorator, which is built around `Observable` and `GET`;
this is a `POST` with a body, so `EventSource` is out on the client side too.

*Deviation:* busy and asleep needed distinguishing on the wire after all, because the i18n section
below puts both lines client-side and the client has to pick one. Busy keeps its specified `503`;
unconfigured and unreachable both answer `502`, which is what makes them one degraded path rather
than two. Headers are held back until the first delta, so a failure before the answer starts is a
real status code rather than a half-written stream.

## Frontend

**Where:** `frontend/src/terminal/commands/ask.ts`, plus `api.askStream()` in `lib/api.ts`.

`fetch` with a `ReadableStream` reader — the same `request()` error shaping as the rest of `api.ts`
does not apply to a stream, so `askStream` is its own function that yields deltas and throws
`ApiError` on a non-OK status before the body starts.

**Rendering** uses `ctx.frame()`: accumulate the answer, re-wrap with the existing `wrap()` helper in
`format.ts`, redraw the region on each delta. A `▌` cursor trails the text while streaming and is
dropped at `[DONE]`. Under `prefers-reduced-motion`, buffer the whole answer and print it once —
text appearing character by character is motion, and §5's rule does not have an exception for text.

**Two modes**, matching how `mail` already works:

- `ask <question>` — one-shot.
- `ask` with no arguments — prompts for the question via `ctx.prompt()`, which is what makes
  `palette: true` sensible. Not `hidden`: this is a feature, not an easter egg.

**First line of every answer** is a muted disclaimer: *"a local model wrote this and it can be wrong
— for the real answer, `mail`."* Non-negotiable. A model paraphrasing someone's CV in first person
without a label is a small lie, and this site's whole tone depends on not telling those.

**Degradation** (principle #3) — unconfigured, asleep, or unreachable all render the same line:

```
the model runs on a machine in my flat and it is currently asleep.
try `mail` — that one reaches the human.
```

That line is arguably better than the working feature, and it is the one most visitors will see.

**Not-found hook:** `run()` in `useTerminal.ts` currently prints `command not found` plus a
`suggest()` hint. When `suggest()` returns nothing and the input contains a space — i.e. it reads as
a sentence rather than a typo — offer `ask "<raw>"` instead. Someone who types `where does he work`
into a terminal has told you exactly what they want.

## Achievements

One new entry: `ask` ("Turing Test" / "Test de Turing"), unlocked on a first completed answer, hint
*"There is someone else in here to talk to."* Unlocked on completion rather than on invocation, so a
timed-out request does not award it.

The list grows from 18 to 19 (or more if the other specs ship first); the `n/18` counter in
`AchievementsModal.vue` and the `achievements` command must read the list length rather than a
literal — both already did, so nothing had to change there.

## i18n

`m.ask` namespace for command chrome: the disclaimer, the asleep/busy lines, the interactive prompt's
question, the streaming placeholder. The *answer* is generated in the requested locale by the model
itself and is never translated client-side.

## Out of scope

- **Multi-turn conversation.** No history, no follow-ups, no `ctx.prompt()` loop. Each `ask` is
  independent. Conversation state means session storage, longer contexts, and a much larger surface
  for both abuse and cost.
- **RAG, embeddings, a vector store.** The corpus is measured in kilobytes.
- **Tool use / function calling.** The model reads context and writes prose. It does not get to call
  the site's own API.
- **Transcript storage or analytics on questions.** See logging above.
- **Model or hardware recommendations.** Which model runs on which box is an operational choice this
  spec deliberately does not make; it only requires an OpenAI-compatible `/chat/completions`
  endpoint with `stream: true`, which every common self-hosting runtime exposes.
- **Mobile.** Terminal-only, therefore desktop-only (§9). A rendered "ask" widget on the page is a
  different feature with a different spec.
