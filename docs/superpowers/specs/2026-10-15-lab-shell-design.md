# Design spec — the lab shell: `ssh poseidon`

Status: implemented with roadmap §K. One addition: `ctx.prompt()` gained an `inline` option, so the machine's prompt and the line typed at it read as one line, as a shell's do. A hidden command's new branch: it extends the `ssh` egg in
`terminal/commands/eggs.ts`, reads [the lab map](2026-10-15-lab-map-design.md)'s `GET /lab`, and
works without it. Build it after the lab map.

## Context

Goal: let `ssh poseidon` and `ssh optimus` open a pretend shell on the lab's machines in which
every number is real, read from the public lab snapshot: the terminal's deepest easter egg.

The terminal already plays at being a machine: `neofetch`, `uptime`, `/proc`, `systemctl status`,
`top`. And `ssh` exists, but resolves only the site itself: `ssh jules@jhemery.xyz` plays its
connection stages and unlocks *ssh*, `contact@` opens the contact section, and every other host
*could not be resolved*. Meanwhile the lab's machines are named in `hardware nas` and, after the
map, drawn on `/lab`. Typing one of those names should go somewhere.

**It is a costume, and says so.** The banner carries one line: *simulated shell — the numbers are
real, the shell isn't.* Nothing runs anywhere, no connection is made to the lab, and every value
comes from `GET /lab`, which anyone can `curl`. The same honesty that puts a disclaimer on `ask`.

## Getting in

- `ssh`'s resolver learns the machine nodes of `content/lab.ts`: `ssh poseidon`,
  `ssh jules@poseidon`, `ssh optimus`. Tab offers them after today's two targets.
- `root@poseidon` is refused as a real box would refuse it: *Permission denied (publickey). root
  can't log in over ssh here.* Other users get today's denial and hint.
- Unknown hosts keep today's *Could not resolve hostname*.
- **Connecting:** a few `paced()` stages in today's style (skipped when `still()`), one
  `api.lab()` fetch, then the message of the day:

  ```
  simulated shell — the numbers are real, the shell isn't.
  poseidon · TrueNAS CE · MSI MEG Trident X 10th
  up 12 days · load 0.42 · pool tank ONLINE, 61 % used
  snapshot 40 s old · `exit` to leave
  ```

- **With the feed off, it still opens.** Unconfigured, unreachable or stale, the banner says
  *live feed off — what follows are specs, not readings* (or the snapshot's age), and the shell
  answers from `content/hardware.ts`. An achievement that waited on a live service would hold
  `completionist` hostage to the lab's uptime, which is the reasoning that kept the seasons from
  having one.

## Inside

- **A loop over `ctx.prompt()`** with the machine's prompt, `jules@poseidon:~$`, each line
  dispatched to a small table in `terminal/lab-shell/`. These are not site commands: they are
  not in the registry, `help` doesn't list them, and the registry's invariants don't apply. It is
  one command's `run()`, so it is no special case in the shell.
- **Leaving:** `exit`, `logout`, or Ctrl+C through `ctx.signal`, each ending in *Connection to
  poseidon closed.* and the site's prompt again.
- **Not a tty:** `prompt()` throws inside a pipe, so `ssh poseidon | cat` prints the banner and
  then *not a tty*, like any other interactive command.
- No Tab, no history and no pipes inside: `prompt()` has no completer, and a second shell
  language is not worth building for an egg.
- `writes` stays `none`, `hidden` stays `true`, and the tap shell keeps not offering it.

| Command | Prints | From |
|---|---|---|
| `uptime` | `19:42:01 up 12 days, load average: 0.42` | snapshot |
| `free -h` | used and total memory: the percentage times `hardware.ts`'s RAM | snapshot, specs |
| `zpool status`, `zpool list` | each pool, its health word and fill | snapshot |
| `nvidia-smi` | poseidon's GPU: name, use, VRAM, temperature, power | snapshot, specs |
| `ollama ps`, `ollama list` | the loaded models, the installed ones | snapshot |
| `ollama run` | *the real one is wired to `ask`. exit and try `ask <question>`.* | none |
| `docker ps` | the running count, and the services `content/lab.ts` puts on this machine; container names are not on the public feed | snapshot, content |
| `glances` | a live view, below | snapshot |
| `neofetch` | this machine's version, from `hardware.ts` and the snapshot | specs, snapshot |
| `cat /etc/motd` | the banner again | snapshot |
| `hostname`, `whoami`, `pwd`, `ls` | the small things a shell answers; `ls` shows a few dotfiles | fixed |
| `ssh optimus` | hops: the prompt becomes the other machine's | snapshot |
| `sudo …` | *jules is not in the sudoers file. This incident will be reported.* | fixed |
| `rm` of anything | *nice try. this shell can't delete anything; it can barely read.* | fixed |
| anything else | `bash: <name>: command not found` | none |

A machine without the hardware answers as one would: on optimus, `nvidia-smi` and `ollama` are
*command not found*. Every figure goes through the lab map's `lib/lab.ts`, so `uptime` here and
poseidon's card on `/lab` always agree.

### `glances`

- A `frame()` redrawn with CPU, memory, temperatures, pools and the GPU, its header carrying the
  snapshot's age.
- It refetches `GET /lab` every 10 s while open; the API's own copy changes once a minute, so
  that is often enough to see it move.
- `ctx.capture()` holds the keyboard: `q` or Esc quits, `r` refetches now.
- At *paused* motion it draws once and redraws only on `r`.

## Achievement

One new entry: `labRat`, *Lab Rat* / *Rat de labo*, hint *Some of the machines here answer to
their own names.* It unlocks on reaching a lab machine's prompt, with the feed on or off. It joins
`achievementList` and the README's spoiler table; the counters already read the list's length.

## Tests

All in vitest; jsdom reaches every part, so there is no e2e.

- The resolver: lab hosts accepted, `root` refused, unknown hosts unresolved, and today's two
  targets unchanged.
- The banner with a fresh, a stale and no snapshot.
- Each command in the table against a fixture snapshot, table-driven, including optimus's
  *command not found*.
- `glances`: a refetch on the timer and on `r`, and `q` releasing the keyboard.
- Ctrl+C ends the session; inside a pipe, the banner then *not a tty*.
- `labRat` unlocks with the feed off.
- `registry.spec.ts`'s classification still reads `ssh` as `none`.

## Out of scope

- A real connection of any kind to anything.
- A filesystem beyond the few files `ls` shows.
- Tab completion, history and pipes inside the shell.
- Any interplay with the CTF.
