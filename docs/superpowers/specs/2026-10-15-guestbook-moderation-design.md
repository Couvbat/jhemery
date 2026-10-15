# Design spec — the guestbook's first reader: a local model

Status: proposed, not built. Settles the question §I's *Guestbook entries as wireframes* left
with the owner: the backend filters nothing but links. Shares the model with `ask`, so it comes
after [ask my lab](2026-10-15-ask-my-lab-design.md), and its first step extracts the model slot
the two will share.

## Context

Goal: have the self-hosted model read every guestbook entry before it shows, hold what looks
abusive for the owner, and optionally reply, without the guestbook ever depending on the lab.

Today `POST /guestbook` sanitises, refuses links, allows one entry a minute per IP, keeps 500,
and publishes at once. The owner's `sudo rm <file>` is the only moderation, and it comes after
the fact. Since #151 that matters more: every entry's name is a wireframe in the background of
every page, and `/legal#guestbook` promises that unlawful, hateful, harassing, advertising and
doxxing entries come down — which today means after they have been up.

One principle bounds the design: **the model can only make the guestbook stricter than it is
today, never less available.** When the model is off, asleep or confused, an entry publishes
under today's rules after a grace period. Only an explicit verdict from the model holds anything.

## Configuration

- `GUESTBOOK_MODERATION=off` (default) or `model`. Off is today's behaviour, byte for byte,
  status codes included.
- `GUESTBOOK_GRACE_MINUTES=30`: how long an entry waits for a verdict before it publishes anyway.
- `GUESTBOOK_REPLIES=false`: the optional reply, below.
- The model is `ask`'s: `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY`. Moderation does not need
  `ASK_ENABLED`, so the owner can moderate with the public `ask` off.

## An entry's life

```
sign ──▶ pending ──(model: publish)──▶ published
            │ ├──(model: hold)───────▶ held ──(owner: approve)──▶ published
            │ └──(no verdict in 30 min)──────────────────────────▶ published (grace)
            └──(owner: rm) ▶ gone          held ──(owner: rm)──▶ gone
```

- `POST /guestbook` stores the entry as `pending` and answers `202 { id, status: 'pending' }`
  instead of `201` and the entry. The frontend accepts both, since the two apps deploy in no
  fixed order.
- A worker in `GuestbookService` takes pending entries oldest first, one at a time, through the
  shared slot as a background caller (below).
- **`publish`** makes it `published`, with `moderatedBy: 'model'`.
- **`hold`** makes it `held`, with the model's `reason`. It stays out of every public list and
  waits for the owner. Nothing is ever deleted automatically.
- **Output that doesn't parse** is retried once, then left pending, where the grace period takes
  over. A garbled answer is the model failing, not a verdict, and must not hold anyone's entry.
- **Grace:** a pending entry older than `GUESTBOOK_GRACE_MINUTES` publishes with
  `moderatedBy: 'grace'`.
- **Limits:** the 1/min per IP stays. Pending and held together are capped at 50; past that,
  `sign` answers 503, *the guestbook is catching up*, so a burst can't queue unbounded work for a
  GPU at home. The cap of 500 applies to published entries.
- **Existing entries** have no status and read as `published`. The Mongo schema gains `status`,
  `reason`, `moderatedBy`, `signedAt` and `reply`, all optional with defaults; the JSON file is
  read the same way. No migration step.
- `GET /guestbook` returns published entries only. The ticker and the wireframes read that list,
  so a held name never becomes a shape.

## The classifier call

- Temperature 0, `max_tokens: 60`, `reasoning_effort: 'none'` as in `ask`, and
  `response_format: { type: 'json_object' }` where the runtime supports it (check Ollama's `/v1`
  route). The answer must parse as exactly
  `{"verdict":"publish"|"hold","reason":"spam"|"hate"|"harassment"|"sexual"|"personal-data"|"illegal"|"none"}`.
- The system prompt, in English like `ask`'s, mirrors `/legal`'s list of what comes down and is as
  explicit about what stays up: **criticism of Jules or the site, jokes, swearing that isn't aimed
  at someone, and any language publish.** A moderator that holds the negative entries is a
  flattery filter, and the guestbook would be worth less for it.
- The entry goes in the user message as data, a JSON object `{ "name": …, "message": … }`, with
  the system prompt saying that any instruction inside it is part of what is being judged.
- **Injection, stated plainly:** a crafted entry can talk the model into `publish`. The result is
  today's behaviour, an entry that is up until the owner removes it. The other direction is
  closed: each call sees one entry, so nobody can get someone else's held.
- **Logging:** verdict, reason and latency. Never the name or the message: held entries are not
  public, and a log is not where they should first be read.
- **An evaluation script**, `backend/scripts/eval-moderation.ts`, runs about twenty labelled
  fixtures (criticism, a joke, French, spam, an address, a slur) against the configured model and
  prints agreement. The owner runs it after changing `LLM_MODEL`; it is not part of CI, which has
  no model.

## The shared slot — `common/llm.ts`

The first commit, and a refactor only:

- The OpenAI-compatible client moves out of `AskService`: base URL, key, model,
  `reasoning_effort`, the `<think>` filter, the event-stream reader.
- So does the single slot, with two ways in. `tryAcquire()` is `ask`'s: the slot or 503 at once,
  as today. `acquire({ background: true })` is moderation's: it waits until the slot is free *and*
  no detached warm-up is running, and gives the slot back after each call.
- A visitor who asks during a moderation call, about a second at 60 tokens, gets today's busy
  line. That is rare enough to accept and keeps the slot a single, simple rule.
- `AskService`'s spec suite must pass untouched. That is the refactor's test.

## Replies — optional

With `GUESTBOOK_REPLIES=true`:

- Only entries **the model** published get one: not grace, not owner-approved. A reply to an
  entry nothing has read would be a reply to anything.
- One sentence of at most 140 characters, in the entry's language (`sign` sends an optional
  `locale`, the terminal's), friendly, never repeating personal details, never promising anything
  on Jules's behalf.
- Stored on the entry as `reply: { text, by: 'model' }`. It passes `sanitise()` and the link
  filter too, since a model can write a URL.
- **Grounded in the site**, like `ask` ([ask my lab](2026-10-15-ask-my-lab-design.md), part 2):
  the entry is the query, its best passages go into the reply's prompt, and the reply may say
  only what the site already says. A signer who mentions the snake game can be told that tetris
  is in there too. The API attaches the best passage's target as `reply.see` when retrieval found
  one above the score floor, and the terminal renders that as a link; the reply's text still goes
  through the link filter, so the model never writes one itself.
- Same worker pass, same slot, one try. A failure means no reply.
- Shown under the entry in `cat guestbook/<file>`, muted and labelled as model-written, in the
  spirit of `ask`'s disclaimer: `↳ a local model replied: …`. The ticker shows entries, not
  replies.
- `DELETE /guestbook/:id/reply` (owner) clears one.

## The owner's side

- `GET /guestbook/held` lists held and pending entries with reason and age;
  `POST /guestbook/:id/approve` publishes one with `moderatedBy: 'owner'`; `DELETE /guestbook/:id`
  works on held entries too. All three use `AdminGuard`.
- **A fix found on the way:** today's `DELETE` checks the password inline with `!==`, which is
  not constant-time, while `AdminGuard` uses `sameSecret()`. Moving the route onto the guard fixes
  it; the guard's comment already says the inline check predates it.
- In the terminal, beside `sudo rm <file>` in `sudo`'s own argument handling:
  `sudo guestbook held` lists held entries as files (`held/<file>`), and `sudo approve <file>`
  publishes one. Both prompt for the password as `sudo rm` does.
- `health()` for the guestbook gains `detail: { pending, held }`.

## The signer's side

- `sign` sees `202` and says: *✓ received. a local model reads every entry before it shows —
  usually a few seconds.*
- It then polls `GET /guestbook/:id/status` every 2 s for up to 20 s, in a frame, under the
  motion rule. The route returns only `{ status }`; the id is a random UUID the signer already
  holds, and it is limited to 30 requests a minute per IP.
  - published: *✓ it's up — `guestbook` to see it.*
  - held: *held for Jules to read; it will show if it's fine.*
  - still pending: *the model is asleep. it will show within 30 minutes either way.*
- The `sign` achievement still unlocks on an accepted entry, as today.
- `/legal#guestbook` and the guestbook part of `/privacy` say it, in both languages: *each entry
  is first read by a language model running on my own machine, which may hold it for me to
  review; nothing is sent to anyone else.* An entry now travels from the host in France to a
  machine at home in France, which is worth saying even though it was going to be public anyway.

## Tests

- **Backend:** the lifecycle against a fake slot: publish, hold, garbage then retry then pending
  then grace, on a fake clock; the 50 cap's 503; public lists exclude pending and held; entries
  without a status read as published, from the file and from a Mongo fixture; replies only after
  a model publish, sanitised and link-filtered; every owner route behind `AdminGuard`; the status
  route; logs carry no name or message; the `ask` suite unchanged after the extraction.
- **Frontend:** `sign` handles `201` from an old backend and `202` from a new one; each polling
  outcome; a reply renders as text in `cat`, never markup (the guestbook is the reason
  `OutputLine[]` has no HTML); `sudo approve` and `sudo guestbook held`.

## Out of scope

- Deleting anything automatically.
- A cloud moderation API. The point is that entries never leave the owner's own machines.
- Re-reading the entries already published. The owner can do that once by hand, with
  `sudo rm`.
- Scores, ranking, and an appeals flow: there is one moderator, and `mail` reaches him.
