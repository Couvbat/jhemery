# Design spec — ask my lab: `ask` that knows the site and the lab, shows its work, and says what broke

Status: proposed, not built. Extends [`ask`](2026-08-04-ask-command-design.md), whose limits all
stand unless a section here says otherwise: 5 questions an hour per IP, one in flight, ~300 tokens
out, the 20 s first-token deadline and its detach, the 45 s response ceiling, nothing logged but
latency and outcome. Part 1 reads the snapshot that [the lab map](2026-10-15-lab-map-design.md)
introduces, so it comes after it; parts 2 and 4 don't need the map and can go first.

## Context

Goal: let `ask` answer from everything the site already says and from the lab as it is now, show
which model wrote each answer and from which pages, name the hop that failed, and offer it on
`/lab`.

The prompt for this came from production. On 15 October 2026 `ask` wasn't answering while
`GET /health` reported the unit `active`, which only means it is configured. Every failure
renders the same "asleep" line, by design (one degraded path), and `deploy.md` lists the gap this
leaves: *nothing on the server reports why `ask` failed*. That is nearly true: the service's warn
line does carry the upstream's status or error, such as `The model answered 403` or
`The model is unreachable: fetch failed`, but only in Passenger's stderr log on the host. Nothing
a visitor, `systemctl` or the owner's own terminal can see says which hop failed, so each outage
is diagnosed again from black-box probes and the model host's log. Three smaller faults sit in
the same path:

- **The model knows a summary, not the site.** It is given `llms.txt`, about 2 kB. The site says
  far more: the case studies under `/work`, the fifteen `why` topics, `/now`, the hardware, music
  and gaming sections, nineteen design notes. A visitor's question is usually about one of those,
  and today the honest answer to most of them is "the context doesn't say".
- **A rate-limited visitor is told the model is asleep.** `degraded()` in
  `terminal/commands/ask.ts` treats every status but 503 as asleep, so the sixth question in an
  hour, a 429, reads as an outage. Someone testing a broken `ask` hits it on the sixth try and
  keeps seeing "asleep" after the model is back.
- **The answer has no provenance.** The disclaimer says a local model wrote it, but not which,
  where, how long it took, or what on the site it drew from.

Five parts, each shippable alone, in this order: 4, 2, 1, 3, 5.

## 1. The lab in the context

- `AskService` has `LabService` injected. It is the same process, so the snapshot is a function
  call: no HTTP and no loopback (the lesson of the corpus correction in the `ask` spec).
- A pure `labBrief(snapshot, ageMs)` renders it as a `LAB NOW` block in `systemPrompt()`: at most
  1 200 characters, one line per machine and one for the models, ending with the snapshot's age.
  For example:

  ```
  LAB NOW (snapshot 40 s old):
  poseidon: up 12 days, CPU 8 %, GPU 3 % (RTX 3080, 2.1 of 10 GB VRAM), pool tank ONLINE 61 % full
  optimus: up 30 days, CPU 2 %, pool data ONLINE 74 % full
  models loaded: gemma4:e4b; installed: 6
  ```

  Stale, the heading says *last seen 3 h ago, may be out of date*. With the lab unconfigured the
  block is left out.
- One rule joins the list: *facts under LAB NOW are measurements at the age stated; when asked
  about live state, give the age; never infer anything they do not say.*
- The static topology reaches the model through `llms.txt`, whose `{{lab}}` list the lab map adds,
  and through the lab's passages (part 2).
- The blast-radius argument still holds: the block contains only what `GET /lab` already
  publishes.

## 2. What the site already says

The rule this part adds: **the model may say anything the site already says, and nothing it
doesn't.** Everything below exists to put the right part of the site in front of it.

### Two tiers

- **Always in the prompt**, about 12 000 characters: `llms.txt` as today; the profile,
  experience, skills, projects and `/now` from `content.json`; and the lab brief. `content.json`
  is already fetched, version-checked and cached by `McpContentService` for the MCP endpoint, so
  `ask` reads that service rather than fetching a second copy, and works whether or not MCP is
  enabled.
- **Looked up per question**: the passages most relevant to it, at most four and 5 000
  characters, from a new build artifact.

### `/corpus.json`

- Emitted by a build plugin beside `content.json` and `search.json`, walking the same sources the
  search plugin walks, but keeping them whole: one passage per case-study section; per `why`
  topic (what was chosen, what was rejected and why, the hindsight); per design-note section
  (the heading and its prose, code blocks dropped, split at paragraph boundaries past 1 500
  characters); `/now`; each machine in `hardware.ts`; the music, gaming and tools sections; and
  each lab node.
- Its shape: `{ version: 1, generatedAt, passages: [{ id, kind, title, text, target, lang? }] }`,
  with `title` and `text` `Localised` where the source is and plain where it is a single-language
  note. `target` is what a search result already carries: a route (`/work/qr`), a note anchor, or
  a `?run=` line such as `why polling`.
- It is the second file the backend reads from the frontend, so it follows `content.json`'s
  rule: a `version` the backend checks against a list it knows, its shape mirrored in
  `backend/src/ask/corpus.types.ts`, and a change of shape is a new version that the backend
  accepts beside the old one, since the two apps deploy in no fixed order.
- Kept out of the precache and the sitemap, like `search.json`. It is public text, and a crawler
  already has the pages.
- Fetched in the background and cached for an hour, never on a question's path (the corpus
  correction again). Not fetched yet, or refused for its version, `ask` answers from the first
  tier alone, as it does today.
- A spec holds it to the site, the way `search.spec.ts` holds the search index: every work id,
  every decision id and every note heading has a passage, and every target resolves.

### Retrieval: lexical, in the API's process

- A pure `retrieve(question, index, locale)` scores passages with BM25 over lower-cased,
  accent-folded words, with English and French stop words dropped and a word matched on its
  first five letters, so `serveur` meets `serveurs` and `deploy` meets `deployment`.
- A match in a title weighs more than one in the body, as in the palette's scorer.
- The index (term frequencies and lengths) is built once per fetch. A few hundred passages scan in
  well under a millisecond, so there is no dependency and nothing to tune at runtime.
- Passages under a score floor are dropped: a question about nothing on the site gets no passages
  rather than the least bad four.
- The visitor's locale picks the text where a passage has both. The French note stays French, the
  English ones English; the model answers in the asked locale either way.

### What the prompt says

- The passages go in a `PASSAGES` block after `CONTEXT`, each headed by its title and target.
- The rules become: *answer only from CONTEXT, PASSAGES and LAB NOW; when none of them says, say
  that the site doesn't say and point at `mail`; never write a link or a path, because the
  terminal prints the sources itself.*

### The context window

Ollama's default context window is a few thousand tokens, and a prompt longer than the window is
truncated without an error, which can take the rules with it. Even today's 16 000-character
corpus cap can exceed the default. Both tiers, the passages and the answer come to about 6 000
tokens, so:

- `deploy.md` says to raise the model's context to at least 8 192 tokens on the model host
  (`OLLAMA_CONTEXT_LENGTH`, or `num_ctx` in a Modelfile), and to check it after changing
  `LLM_MODEL`.
- The service caps the assembled prompt at `MAX_PROMPT_CHARS` (24 000), dropping passages from
  the bottom first and never the rules.

### The decision this changes

`ask-no-rag` in `content/decisions.ts` says `ask` sends "the whole of llms.txt, a few kilobytes"
instead of retrieving passages. That was right when the site was a few kilobytes, and it stops
being true here. A new decision, `ask-retrieval`, records the change:

- **Chose** lexical retrieval over the site's own passages, in the API's process.
- **Rejected** the whole site in the prompt: with the notes it is hundreds of kilobytes, past any
  home GPU's context window.
- **Rejected** embeddings and a vector store: a second call into the home network per question,
  an index to rebuild on every deploy, and a dependency, for a site small enough that words find
  the right passage.
- **Rejected** `search.json` as it is: its texts are cut at 200 characters, too short to answer
  from.

`ask-no-rag`'s hindsight points at the new one. The search index already lists every decision, so
`why ask-retrieval` is findable from the palette on the day it ships.

## 3. Show the work

- After the last delta and before `[DONE]`, the stream carries one more event:

  ```
  data: {"meta":{"model":"gemma4:e4b","label":"poseidon · RTX 3080","outputTokens":58,
                 "firstTokenMs":410,"totalMs":1930,"tokensPerSecond":38.2,
                 "sources":[{"title":"Why the guestbook ticker polls","target":"why polling"}]}}
  ```

- `model` is `LLM_MODEL`. `label` is a new optional `LLM_HOST_LABEL`, public text the owner
  writes, and is never derived from `LLM_BASE_URL`, whose host stays out of anything public.
- Token counts come from the runtime: the request adds `stream_options: { include_usage: true }`,
  and the final chunk's `usage.completion_tokens` is used. A runtime that ignores the option gets
  a count of deltas instead, sent with `approx: true`. Check Ollama's `/v1` route honours the
  option before relying on it.
- `tokensPerSecond` is output tokens over the time after the first token, so a cold load doesn't
  make a fast model look slow.
- `sources` are the passages the API gave the model, best first, at most three. They come from
  retrieval, not from the model's text, so a source can never be a page that doesn't exist.
- `askStream()` in `lib/api.ts` yields `{ delta }` or `{ meta }` items instead of bare strings.
  `ask.ts` is its only caller today and the `/lab` form will be the second.
- The terminal prints, muted, under the answer:
  `gemma4:e4b · 38 tok/s · first token 0.4 s · poseidon · RTX 3080`, with `~` before the rate
  when it is approximate; then `read more:` and the sources as link segments, the way `why` and
  `projects` print theirs, so a `?run=` source runs and a route navigates.

## 4. Say which hop failed

### On the server

Every failure is classified into a closed set, in one function the specs can drive table by
table:

| Reason | What happened | Status today |
|---|---|---|
| `unconfigured` | `ASK_ENABLED` off or no URL | 502 |
| `busy` | the one slot is taken | 503 |
| `warming` | a detached cold load is still running | 502 |
| `unreachable` | no HTTP answer: DNS, connect, TLS | 502 |
| `refused` | the model host's edge answered 401 or 403 | 502 |
| `upstream` | 5xx from the runtime, the proxy or the tunnel, 524 included | 502 |
| `timeout` | no first token in 20 s, so the request detached | 502 |
| `empty` | the stream ended with no answer, or only thinking | 200 with no delta |
| `silent` | the controller's 45 s ceiling answered for it | in-stream `asleep` |

- Status codes stay as they are, so a frontend from before this change still degrades
  correctly; the two apps deploy in no fixed order. The error body gains `{ reason }`, and the
  in-stream error becomes `{ error: 'asleep', reason }`.
- `refused` is the one this spec most wants: it is what a Cloudflare rule that no longer admits
  the API host looks like from the API, and it is the cheapest outage to fix once it has a name.
- The existing log line leads with the reason:
  `ask failed after 812ms: refused (The model answered 403)`. Still no question, answer or IP.

### In `/health`

`common/health.ts`'s `UnitHealth` gains an optional `last?: { outcome: string; agoMs: number }`,
and the `ask` unit reports its last real outcome (`ok` or a reason) and how long ago, plus
`detail: { ok, failed, passages }` since the process started, `passages` being how many the
corpus holds (0 until it has been fetched). This keeps `/health`'s rule: it reports what the last
real question found, and never sends one of its own.

`systemctl status ask` prints it: *last answer 4 min ago*, or *last failure 2 min ago: the model
host's edge refused the API*. The frontend mirrors the type; a backend without `last` prints as
today.

### In the terminal

- `degraded()` reads the reason and says, in plain words and both locales:
  - `unreachable`, `refused`, `upstream`: *the model's machine isn't answering the site right
    now.*
  - `warming`, `timeout`, `empty`, `silent`: *the model was asleep and is waking up — ask again
    in a minute.*
  - `busy`: unchanged.
  - `unconfigured`: *there's no model wired up here.*
  - **429**, newly told apart: *that's five questions this hour — the limit resets within the
    hour.* The guard sends no `Retry-After` today; adding one to `rate-limit.guard.ts` (seconds
    until the window frees) lets the line give the minutes, and helps every other limited route.
  - Every line but the 429 still ends by pointing at `mail`.
- With the lab map built, a pre-check is one read of a route the API serves from memory: when
  `GET /lab` says `models.runtime` is `up` but nothing is resident, `ask` says before streaming
  that *the model isn't loaded, so the first answer may not come in time*. A failed or slow read
  skips the pre-check rather than delaying the question.

### In `deploy.md`

A short "When `ask` is silent" runbook, in this order: `strace ask test` in the site's terminal
(429 versus 502 versus a stream); `systemctl status ask` for the reason; the model's `/v1/models`
from the home network (edge, tunnel, proxy and runtime together); the same from the API host over
SSH (the edge rule as the API's own address meets it); the backend's stderr log, whose
`ask failed after …` lines name the upstream status; the runtime's log on the model host. Each
step rules out one hop. Each probe from outside spends one of the five questions an hour, so a
sixth reads as a 429, not as the outage.

## 5. On the page

- `/lab` gains an *Ask the lab* panel: a `<form>` with a labelled text input (3 to 240
  characters, as the DTO), a submit button, the disclaimer, the answer in a `role="log"` region,
  and the meta line and sources under it, the sources as ordinary links.
- Three suggested questions as buttons that **fill** the input without sending it, since asking
  spends one of five: *What runs this site?*, *Why does the guestbook ticker poll?*, *Which
  models are loaded?*
- Same endpoint and same limit, so the terminal and the page share the five by construction.
- **Phones get it.** §10 keeps the *terminal's prompt* off phones because a fixed input fights
  the virtual keyboard. This is an ordinary form on a page, which phones handle like any other,
  and it is the "rendered `ask` widget" the `ask` spec deferred to a spec of its own.
- The answer streams under the same motion rule as the terminal: at *paused*, buffered and shown
  once.
- The `ask` achievement unlocks on a completed answer here too.
- One pure helper, `lib/ask-session.ts`, runs the stream, accumulates the answer and maps errors
  to the degraded copy, for both `ask.ts` and the panel, so the two can't drift.
- It lives in `LabView`'s chunk; the home page pays nothing.

## Tests

- **Backend:** `labBrief()` fresh, stale, absent and capped; the prompt carries the block only
  when the lab is configured; `retrieve()` on accent folding, stop words in both languages, the
  five-letter prefix, the title weight, the score floor and the locale's pick; the prompt budget
  drops passages before anything else; a `corpus.json` of an unknown version is refused and the
  first tier still answers; the meta event comes before `[DONE]`, from `usage` and from the delta
  count, with `sources` equal to the passages given; the reason table, one case per row (a thrown
  `ECONNREFUSED`, a 403, a 524, the 20 s deadline, a warm-up in flight); `health()` reports `last`
  and the counts; the existing assertion that logs never contain the question still passes.
- **Frontend:** the corpus plugin's spec above; `askStream()` parses meta, sources and reasons;
  `ask` prints the meta line and the sources as links; one degraded line per reason, and the 429;
  the panel validates length, its suggestions fill without sending, and it shares the session
  helper.
- The `ask` spec's suite passes unchanged apart from the new event, which is the refactor's real
  test.

## Out of scope

- Multi-turn conversation, as before.
- Embeddings and a vector store, for the reasons in `ask-retrieval` above.
- Tools. The model reads the site and a snapshot; it never runs anything on the lab, and nothing
  here moves towards that.
- Choosing a model per question, or comparing models side by side. A bench board was in the
  brainstorm and is a different feature.
- A live tokens-per-second readout while streaming: the meta line after the answer is enough.
