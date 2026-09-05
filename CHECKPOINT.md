# CtxMap — session checkpoint / resume handoff

*Last updated 2026-09-05. Read this first to resume. Full design lives in
`chang47/software-factory` → `docs/ctxmap-dashboard-design.md` and issue
[#1](https://github.com/chang47/CtxMap/issues/1).*

## Where we are

CtxMap is the operator's "rep #1" — a read-only analyzer of Claude Code JSONL transcripts
(`~/.claude/projects/`) that reports token/cost/context and **what to fix**. It reads the real
billing-grade `usage` object per turn — no tokenizer. **Issue #1 §1–§5 are done; issue #2 (precision) is
done; benchmarking (fork A) + an opt-in LLM judge landed. 90 tests, tsc clean, web typecheck clean, all on
`main`.** Head at checkpoint: `aae25d3`.

The tool is **feature-complete for a v0.1 launch.** The only things left before going public are the two
outward-facing / cost-incurring steps that need the operator's explicit go (below).

### Done (all pushed to main)
- **§1 meter:** per-model pricing + `resolveModel`, `message.model` parsed, per-model window, de-duped
  constants, per-turn cost.
- **§2 shapes:** array `tool_result.content` normalized; subagent transcripts folded in (main/subagent split).
- **§3 report surface:** `ctxmap report` → one self-contained HTML (no server), `vite-plugin-singlefile`
  template + runtime `ReportEnvelope` injection; packaging (`files`, `prepare`, lean deps); `serve` dropped;
  payload slimmed (no raw output/prompts shipped).
- **§4 findings linter:** `oversized-output`, `hot-file` (Read/Edit/Write churn), `cache-recreation`
  (session-level), `dead-weight-read` — "What to fix" panel + terminal block. Validated on real data.
- **§5 polish:** fixed Cache Hit Rate (was 500–3000%), Timeline weekly bucketing (Monday, matches CLI),
  exported + tested `buildMassAggregation` (caught a real endDate bug).
- **Issue #2 precision:** cache-creation split by TTL (1h=2×, 5m=1.25×, read=0.1×; Fable read 0.025×) from
  `usage.cache_creation.ephemeral_1h/5m`; thinking tokens surfaced. On a real 1h-cache session this was a
  +$350 (11%) cost correction. Issue #2 is CLOSED.
- **Benchmarking (fork A):** `tag` + `bench`, model × workflow matrix, `kind:'aggregate'` report.
- **LLM judge (opt-in):** `ctxmap judge <session>` auto-sets the quality rating (`ratingSource:'judge'`);
  core stays read-only (SDK is a dynamic import in the command only); `--dry-run` needs no key.

### Architecture
One engine → `SessionReport`; everything renders through a lens-agnostic
`ReportEnvelope {kind:'session'|'aggregate'|'compaction-diff', data}` injected into one HTML template.
Adding a fork = compute a struct, stamp `kind`, add a panel. (design doc §6/§8.)

### Validated on real transcripts (2026-09-05)
Ran across all 8 real sessions + independently verified findings from the raw JSONL (the cache finding's
events were 98% gap-correlated; the oversized read was a real 58KB file; the TTL split matched a 100%-1h
session). Engine + all detectors + the TTL cost all hold on real data.

## Open issues (logged 2026-09-05)
- **#3 — pre-launch readiness** (README stale, no LICENSE, missing package metadata): blocks a credible npm publish.
- **#4 — retired serve/dashboard dead code**: delete, or rebuild as the `report --all` trends mode.
- **#5 — polish backlog**: cache-recreation $ ignores the 1h TTL rate; no CLI/integration test coverage; `aggregate` naming overlap.

## Next up (resume here)

1. **Launch (needs operator go — outward-facing):** `npm publish` the package, then **Show HN** (title in
   issue #1 §5) → r/ClaudeAI + DevHunt. Everything technical for this is ready (`npm pack` ships only
   `dist/`, `prepare` builds, README exists). NOT done autonomously — publishing distributes the operator's
   tool publicly under their account.
2. **Run the judge (needs operator go — spends money / needs key):** the `judge` command is built and
   dry-run-verified; actually running it makes Claude API calls, so it needs `ANTHROPIC_API_KEY` (or
   `ant auth login`) and the operator's ok to spend. Consider calibrating the judge against a handful of
   hand ratings before trusting it at scale.
3. **Deferred / future:** cross-session aggregate *trends* mode (`report --all` over the existing
   `useAggregation` dashboard — its Cache Hit Rate + Timeline are now fixed); cross-vendor (Codex/Cursor)
   transcript parsing; the hosted "benchmarking-as-a-service" platform (the tag store + aggregate report are
   its seed). `programmatic-check` judge (score by tests-pass where a task has a verifiable outcome) as a
   rigor upgrade over the LLM judge.

## How to resume
```
cd <clone>            # git pull; head should be aae25d3 or later on main
npm install           # runs prepare → builds CLI + report template
npm test              # expect 90 passing
node dist/cli/index.js report --latest --output /tmp/r.html   # session report
node dist/cli/index.js bench --output /tmp/bench.html         # model × workflow (after tagging)
node dist/cli/index.js judge <id> --dry-run                   # judge prompt, no API call
```
Operator works on `main` directly (prototyping). Never change model constants/thresholds without checking
`claude-api` skill pricing. Commit trailer + session link as in recent history.
