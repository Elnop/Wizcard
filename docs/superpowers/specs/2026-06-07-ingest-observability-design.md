# MPC Ingest — Observability Redesign

**Date:** 2026-06-07
**Status:** Approved — ready for implementation plan

## Problem

The MPC custom-card ingest (`scripts/ingest/*`) has grown inconsistent observability:

- **No live progress** — during Scryfall resolution and image mirroring (hundreds of
  images per source), there is no feedback on how far along a run is.
- **Inconsistent logs** — each module calls `console.log/warn` with its own conventions
  (prefixes, emojis `⚠`/`•`/`✓`, mixed FR/EN), impossible to parse reliably.
- **Hard-to-read stats** — the final summary dumps raw JSON plus scattered lines.
- **No verbosity control** — no way to get more or less detail per run.

## Goals

Serve two audiences simultaneously, on separate streams:

1. **Human (stderr):** a live, practical progress view — current position, error counts,
   sources/cards done vs. remaining, global ETA.
2. **Machine (stdout):** standard, parseable/greppable logs — **logfmt** (`key=value`),
   one line per event, following a stable event vocabulary.

## Architecture

A single logger module — `scripts/ingest/logger.ts` — owned by all ingest files.
**After this work, no ingest file calls `console.log/warn` directly.** Everything routes
through the logger. This single chokepoint is what guarantees consistency.

The logger exposes two faces fed by the same call sites:

```
logger.ts
 ├─ event(name, fields)        → stdout : logfmt line (the machine source of truth)
 ├─ warn(name, fields)         → stdout (level=warn) + counted for the recap
 ├─ error(name, fields)        → stdout (level=error)
 ├─ progress.taskStart(id, of) → add a per-task bar
 ├─ progress.taskTick(id, Δ)   → update task bar + global bar (redraw, throttled)
 ├─ progress.taskEnd(id)       → remove the task bar, free its slot
 ├─ progress.start(globalTotal)→ init global counters / ETA window
 └─ progress.done()            → clear the live block, leave the recap
```

ANSI cursor control lives **only** inside `logger.ts`. No other file touches escape codes.

## Machine format (logfmt, stdout)

Every line: three leading fields, then event-specific fields.

```
ts=<ISO8601> level=<info|warn|error> event=<namespace.action> <fields…>
```

Formatting rules:

- Values without spaces/`=` → raw (`source=mpcfill:foo`); otherwise quoted
  (`reason="HTTP 503 timeout"`).
- Booleans → `true`/`false`. ETA in integer seconds (`eta_s=63`) — never `1m03`.
- **Lists never go inline.** One line per fact: each unresolved file is its own
  `card.unresolved` event — that is what makes the stream `grep`/`jq`-able.

### Event vocabulary

| event             | when                                          | key fields                                                                                                            |
| ----------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `run.start`       | startup                                       | `sources_total` `skip_scryfall` `fuzzy` `re_enrich` `mirror`                                                          |
| `source.listed`   | Phase 0 pre-listing of a source               | `source` `idx` `total` `images`                                                                                       |
| `listing.done`    | end of Phase 0                                | `sources` `cards_total`                                                                                               |
| `source.start`    | begin processing a source                     | `source` `idx` `total` `pending` `stale`                                                                              |
| `run.progress`    | periodic global progress, non-TTY only (~10s) | `cards_done` `cards_total` `eta_s`                                                                                    |
| `card.resolved`   | per-card resolution (debug only)              | `source` `card` `strategy`                                                                                            |
| `card.failed`     | upsert / re-enrich failure                    | `source` `card` `reason`                                                                                              |
| `card.unresolved` | Scryfall could not resolve                    | `source` `file`                                                                                                       |
| `source.done`     | end of a source                               | `source` `new` `skipped` `failed` `re_enriched` `mirrored` `dup_images` `by_setnum` `by_name` `by_fuzzy` `unresolved` |
| `run.done`        | end of run                                    | `sources` `cards_total` `new` `failed` `unresolved` `duration_s`                                                      |

## Human progress (stderr) — multi-bar

A stacked block, redrawn in place (throttled ~4/s):

```
GLOBAL  ██████░░░░  6 200/9 840 (63%)  · ✓6 050 ⚠150  · ETA 3m02
[1] mpcfill:foo  █████░░░  240/800  ✓228 ⚠12
[2] mpcfill:bar  ██░░░░░░   90/620  ✓90
[3] mpcfill:baz  ███████░  510/700  ✓505 ⚠5
     +3 autres sources en cours…
```

- **1 global bar** over global cards (known after Phase 0 pre-listing) + global ETA.
- **Up to 8 per-task bars** (active sources), in start order. Beyond 8 → a
  `+N autres sources en cours…` line (overflow summary, stable layout).
- Sequential mode (Scryfall active) naturally shows 1 global + 1 task bar.

**Redraw mechanics:** the logger keeps a registry of active tasks
(`Map<sourceId, {done, of, ok, failed}>`). Each frame computes the block height N,
moves the cursor up N lines (`\x1b[<N>A`), clears (`\x1b[J`), and repaints. Bar width
adapts to `process.stderr.columns` (fallback 80).

**ETA:** sliding-window throughput over global cards. Keep `(timestamp, cardsDone)`
samples over ~30s → recent `cards/s`. `eta_s = (cards_total − cards_done) / rate`.
Shown as `Xm YYs` for humans, `eta_s=<int>` for machines. Before ~5s of samples: `ETA —`.

**Non-TTY fallback:** when `process.stderr.isTTY` is false (piped/redirected), emit no
ANSI multi-bar; instead append a readable `run.progress` line every ~10s.

## Final recap

**Human (stderr)** — replaces the raw JSON dump:

```
─── Ingestion terminée en 14m02 ───
  Sources     12 traitées · 0 échouées
  Cartes      9 840 vues · 9 460 nouvelles · 320 skip · 60 échec
  Scryfall    8 900 set+num · 480 nom · 80 fuzzy · 380 non résolues
  Images      1 200 mirrorées · 45 doublons
  ⚠ 12 avertissements (voir events warn / --report)
```

**Machine (stdout):** the `run.done` logfmt event carries all totals. No JSON dump on
stdout anymore.

**JSON report (`--report=path`):** kept as-is. `RunReport`/`SourceReport` unchanged;
`unresolvedFiles`/`warnings` stay listed in full there (exhaustive detail lives in the
report file; the stdout stream carries one event per item).

## Phase 0 pre-listing (enables exact global ETA)

List Drive for **all** sources first (Phase 0), then process (Phase 1). This yields the
exact global card total up front for a precise global ETA. `listDriveFolder` results from
Phase 0 are reused in Phase 1 — no re-listing. Each source's listing emits a
`source.listed` event; `listing.done` closes the phase with `cards_total`.

## Verbosity

Flag `--log-level=<debug|info|warn>` (default `info`):

- `info` — everything except `card.resolved` (per-card successes).
- `debug` — adds `card.resolved` per card.
- `warn` — warnings/errors + cycle events (`run.*`, `source.done`) only; minimal stream.

## Error handling

- `card.failed`, `card.unresolved`, Drive warnings → `level=warn` events on stdout AND
  counted for the recap. Never interrupt the run.
- Fatal errors (Drive 401/403, missing env) → `level=error` event + non-zero exit
  (current behavior preserved).
- Warnings stay collected per source in `warnings[]` for the JSON report (unchanged).

## Out of scope

- No change to ingest logic (resolution, mirroring, DB writes) beyond routing logs and
  splitting listing into Phase 0.
- No external log shipper / aggregator integration — stdout logfmt is the contract; any
  tool consuming it is chosen later.
