# CtxMap Roadmap

## High Priority

### 1. NPM Publish
Make it installable globally via npm.

```bash
npm publish --access public
# Then users can: npm install -g ctxmap
```

**Tasks:**
- [ ] Add `prepare` script for pre-publish build
- [ ] Add `files` field in package.json to include only dist/
- [ ] Test `npm link` works correctly
- [ ] Publish to npm

### 2. Hook Integration
Auto-run analysis after each session.

**Option A: SessionEnd Hook**
```json
// ~/.claude/settings.json
{
  "hooks": {
    "SessionEnd": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "ctxmap turns --latest" }]
    }]
  }
}
```

**Option B: Stop Hook (after each response - more granular)**
```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "ctxmap analyze --latest" }]
    }]
  }
}
```

**Tasks:**
- [ ] Test SessionEnd hook works
- [ ] Document hook setup in README
- [ ] Consider adding `--quiet` flag for hook mode

### 3. History/Trends Command
Track patterns across multiple sessions.

```bash
ctxmap history --days 7      # Last 7 days summary
ctxmap history --project x   # By project
ctxmap trends                # Show patterns
```

**Metrics to track:**
- [ ] Average session cost per day/week
- [ ] Most expensive operations (by tool type)
- [ ] Context growth rate over time
- [ ] Compact frequency
- [ ] Peak context trends

## Medium Priority

### 4. HTML Dashboard
Visual browser for exploring sessions.

**Tech stack options:**
- Vanilla JS + simple server (low dependency)
- Next.js (if we want rich interactivity)
- Static HTML export (no server needed)

**Features:**
- [ ] Session list with filtering
- [ ] Turn-by-turn timeline view
- [ ] Charts for token usage over time
- [ ] Top consumers visualization
- [ ] Cost breakdown by tool

### 5. Optimization Suggestions
Auto-detect inefficient patterns.

**Patterns to detect:**
- [ ] Repeated reads of same large file
- [ ] Bash commands with huge output
- [ ] Skills/CLAUDE.md bloating context
- [ ] Too many parallel Task spawns
- [ ] Files read but never used

**Output:**
```
💡 Suggestions:
- You read src/bigfile.ts 5 times (consider caching)
- Your CLAUDE.md is 8KB (could be trimmed)
- Bash "npm test" returned 45KB of output
```

### 6. Export Formats
Share reports easily.

- [ ] `--format html` - Self-contained HTML report
- [ ] `--format csv` - For spreadsheet analysis
- [ ] `--output file.txt` - Write to file

## Low Priority

### 7. Comparison Features
Compare sessions meaningfully.

```bash
ctxmap diff --sessions abc,def    # Compare two sessions
ctxmap diff --before-date 2026-02-01 --after-date 2026-02-15
```

### 8. Integration with ccusage
Cross-reference with existing tool.

- [ ] Import ccusage cost data
- [ ] Compare our cost estimates vs ccusage

### 9. Config File
Persistent settings.

```bash
ctxmap config set defaultFormat turns
ctxmap config set showUserPrompts true
```

### 10. Watch Mode
Real-time monitoring during a session.

```bash
ctxmap watch  # Streams updates as session progresses
```

---

## Completed

- [x] JSONL parsing
- [x] Token delta calculation
- [x] Tool result size tracking
- [x] Compact detection
- [x] Turn-by-turn breakdown
- [x] User prompt attribution
- [x] CLI commands (analyze, turns, sessions, compare)
- [x] Multiple output formats (table, json, markdown)
- [x] Cost estimation
- [x] Tests (27 passing)
- [x] GitHub repo setup
