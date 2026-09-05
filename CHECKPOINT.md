# CtxMap — session checkpoint / resume handoff

*Last updated 2026-09-05. Read this first to resume. Live status of what's built, what's verified, and
what's next. Full design lives in `chang47/software-factory` → `docs/ctxmap-dashboard-design.md` and issue
[#1](https://github.com/chang47/CtxMap/issues/1).*

## Where we are

CtxMap is the operator's "rep #1" — a read-only analyzer of Claude Code JSONL transcripts
(`~/.claude/projects/`) that reports token/cost/context and, now, **what to fix**. It reads the real
billing-grade `usage` object per turn — no tokenizer. Issue #1 §1–§4 are done; benchmarking (fork A) landed
on the same rails. **80 tests, tsc clean, all on `main`.** Head at checkpoint: `ce6e950`.

### Done (all pushed to main)
- **§1 the meter (credibility gate):** per-model pricing table + `resolveModel`, parse `message.model`,
  per-model context window (Opus/Sonnet/Fable 1M, Haiku 200K), de-duped constants. Cost is summed per-turn
  at each turn's own model rate.
- **§2 real transcript shapes:** normalize array-shaped `tool_result.content`; fold subagent transcripts
  (`<session>/subagents/agent-*.jsonl`, which are all `isSidechain:true`) into the session total with a
  main/subagent split. Synthetic real-shape fixtures.
- **§3 the report surface:** `ctxmap report` → one self-contained HTML file (no server, no data.json), built
  via `vite-plugin-singlefile` into `dist/report/report.html`, runtime injects a `ReportEnvelope`. Packaging:
  `files:[dist]`, `prepare` builds CLI+template, react/recharts moved to devDeps (lean global install).
  `serve` dropped from the CLI. Payload slimmed (drops raw tool output / prompts → 17MB → ~800KB).
- **§4 the findings linter (differentiator):** `core/findings.ts` — `oversized-output`, `hot-file`
  (Read/Edit/Write churn), `cache-recreation` (one session-level finding), `dead-weight-read`. Rendered as a
  "What to fix" panel + a terminal `WHAT TO FIX` block. Validated on real data (see below).
- **§5 (partial):** fixed tool `%-of-session` exceeding 100% (was summing net-of-compaction deltas → now
  gross positive growth).
- **Benchmarking (fork A):** `core/tags.ts` (local tag store `~/.ctxmap/tags.json` — the platform seed),
  `core/bench.ts` (model × workflow rollup), CLI `tag` + `bench`, and a `kind:'aggregate'` report view.
  Answers "can a cheaper model hold quality on this workflow?" via cost (auto) + manual 👍/👌/👎 rating.

### Architecture worth knowing
- **One engine, lens-agnostic delivery.** `generateReport()` → `SessionReport`; everything renders through a
  **`ReportEnvelope { kind: 'session'|'aggregate'|'compaction-diff', data }`** injected into one HTML template.
  Adding a fork = compute a struct, stamp `kind`, add a panel. No second delivery path. (design doc §6/§8.)
- The three measurement forks (flood/benchmark/compaction) are lenses over the same parse; flood = the
  session report + findings, benchmark = the aggregate lens (built), compaction-diff = future.

### Validated on real transcripts (2026-09-05)
Ran across 8 real sessions. Independently verified: the oversized finding is a real 58KB `CURRENT.md` read;
the cache finding's 44 events were **98% preceded by >5-min gaps**, confirming the TTL-expiry root cause.
The big autonomous-loop session shows ~$121 recoverable cache re-creation + heavy edit churn
(research-log.md 244 edits). Small sessions correctly clean.

## Next up (resume here)

1. **Finish §5 polish → launch:**
   - Fix the nonsense **"Cache Hit Rate"** metric (`cache_read / input_tokens`, routinely 500–3000%).
   - Fix **Timeline weekly bucketing** (non-monotonic labels; CLI/dashboard disagree on week start).
   - Add **direct `aggregation.ts` tests** (its test file currently re-implements the logic inline).
   - Then `npm publish` + **Show HN** (title in issue #1 §5) → r/ClaudeAI + DevHunt.
2. **Benchmarking judge (agreed direction):** LLM-as-judge, **opt-in**, rubric-based, to auto-populate the
   quality rating. Add `ratingSource: 'manual'|'judge'` to the tag store. Keep the core read-only; the judge
   is the only piece that makes API calls (needs a key). Programmatic checks where a task has a verifiable
   outcome; manual rating stays the calibration seed.
3. **Precision follow-up (issue #2):** split cache-creation by 1h vs 5m TTL; surface thinking tokens.
4. **Deferred:** cross-session aggregate *trends* mode (`report --all` over the old `useAggregation`
   dashboard); cross-vendor (Codex/Cursor) transcript parsing; hosted "benchmarking-as-a-service" platform
   (the tag store + aggregate report are its seed).

## How to resume
```
cd <clone>            # git pull; head should be ce6e950 or later on main
npm install           # runs prepare → builds CLI + report template
npm test              # expect 80 passing
node dist/cli/index.js report --latest --output /tmp/r.html   # sanity check on a real session
```
The operator works on `main` directly for this repo (prototyping). Commit trailer + session link as in
recent history. Do NOT change model constants or thresholds without checking `claude-api` skill pricing.
