# CtxMap

Claude Code token usage analysis and visualization tool. Understand what's consuming your context window.

## Why CtxMap?

Context window management is critical for effective AI coding:
- Models perform best at 8K-10K tokens (performance degrades with larger contexts)
- 45-83% token reduction is achievable with proper optimization
- Understanding token attribution helps identify inefficient patterns

**Gap in existing tools:**
- `ccusage` - Aggregate session/daily costs, no per-action attribution
- `claude-code-log` - JSONL to HTML browsable logs, no delta analysis
- `/context` - Token breakdown by category, no cross-session tracking

**CtxMap provides**: "This Read on large_file.ts added 12K tokens, Bash git log added 4K"

## Installation

```bash
# Clone and install
git clone git@github.com:chang47/CtxMap.git
cd CtxMap
npm install
npm run build

# Run globally
npm link
ctxmap --help
```

## Usage

### Analyze Sessions

```bash
# Analyze latest session
ctxmap analyze --latest

# Analyze specific session
ctxmap analyze --session abc123...

# Output formats
ctxmap analyze --latest --format json
ctxmap analyze --latest --format markdown
```

### Turn-by-Turn Breakdown

```bash
# Like Chrome DevTools timeline for tokens
ctxmap turns --latest
ctxmap turns --session abc123...
```

Example output:
```
│ Turn │ Context    │  Delta │   Size │ Tool             │ Action
├──────────────────────────────────────────────────────────────────────────┤
│    1 │     40.3K │ 🔥+40.3K │       - │ (text)           │ (model response)
│    2 │     40.3K │      +0 │   0.0KB │ Task             │ Explore project
│    9 │     41.6K │      +0 │ ⚠️31.4KB │ TaskOutput       │ task: ade12fe
│   17 │     81.3K │ ⚠️ +1.6K │   4.6KB │ Read             │ test-gen/SKILL.md
│   28 │     97.2K │ ⚠️ +3.9K │   0.8KB │ Read             │ lib/providers.tsx
│      ⚡ COMPACT: 51.8K → 0 (saved 51.8K)
│ SUMMARY: Peak 128.7K (64.3%) | Total Size: (182.8KB) | Cost: $11.13
```

### List Sessions

```bash
ctxmap sessions
ctxmap sessions --project ship-it
```

### Compare Sessions

```bash
ctxmap compare --latest 5
ctxmap compare --sessions abc123,def456
```

### Mass Aggregation & Pattern Detection

Aggregate all sessions to find patterns, spot anomalies, and get actionable insights.

```bash
# Aggregate all sessions across all projects
ctxmap aggregate

# Filter by project name (substring match)
ctxmap aggregate --project CodeSignal

# Filter by date
ctxmap aggregate --since 2025-01-01

# Output formats (for web UI consumption)
ctxmap aggregate --format json
ctxmap aggregate --format markdown
```

Example output:
```
╭────────────────────────────────────────────────────────────────────╮
│ CtxMap - Mass Aggregation (45 sessions, 12 projects)               │
│ Date range: 2025-01-15 to 2025-02-20                               │
├────────────────────────────────────────────────────────────────────┤
│ OVERVIEW                                                           │
│   Sessions: 45 | Turns: 1,247 | Cost: $234.56                      │
│   Input: 4.2M | Output: 1.8M | Cache Read: 12.3M                   │
├────────────────────────────────────────────────────────────────────┤
│ TOP FILES ACROSS ALL TOOLS                                         │
│   convex/schema.ts    23 total │ 15R 6E 2W │ 12 sess │ 2.3KB       │
│   CLAUDE.md           18 total │ 10R 4E 4W │  9 sess │ 4.1KB       │
│   index.ts            15 total │  8R 5E 2W │  7 sess │ 1.8KB       │
├────────────────────────────────────────────────────────────────────┤
│ INSIGHTS                                                           │
│ 📌 FREQUENT FILE (notice)                                          │
│   convex/schema.ts appears in 27% of your sessions                 │
│   -> Consider adding to CLAUDE.md for persistent context           │
│ 🔧 HIGH CHURN (info)                                               │
│   5 files edited 5+ times across sessions                          │
│   -> Consider if these files need refactoring or better tooling    │
├────────────────────────────────────────────────────────────────────┤
│ USAGE BY WEEK                                                      │
│   Week of Jan 20:   8 sessions | $45.23 █████████████████████      │
│   Week of Jan 27:   6 sessions | $38.12 ███████████████            │
╰────────────────────────────────────────────────────────────────────╯
```

**Key Features:**
- **File Interactions**: See which files you interact with most (Read/Edit/Write breakdown)
- **Insights**: Auto-detected patterns with actionable recommendations
- **High Churn Detection**: Identify files edited frequently across sessions
- **Weekly Trends**: Cost and session count by week
- **No Speculative Costs**: Only factual counts and comparisons (not dollar estimates per action)

## Column Reference

| Column | Meaning |
|--------|---------|
| **Turn** | Turn number in the session |
| **Context** | Current context size (tokens) |
| **Delta** | Token change from previous turn (🔥>5K, ⚠️>1K) |
| **Size** | Tool result size in KB (🔥>50KB, ⚠️>10KB) |
| **Tool** | Tool name used |
| **Action** | File/command/description |

## Terminology

- **Session** = One full conversation (one JSONL file in `~/.claude/projects/`)
- **Turn** = One assistant message with token usage data
- A single user message can result in multiple turns (if Claude makes tool calls)

## How It Works

1. Parses JSONL transcript files from `~/.claude/projects/`
2. Calculates token deltas between consecutive assistant messages
3. Measures tool result sizes to show data volume
4. Detects compact events (>50% context drop)
5. Estimates costs using Claude Opus 4.6 pricing

## Development

```bash
npm run build      # Compile TypeScript
npm run dev        # Watch mode
npm test           # Run tests
npm run check:all  # Type check + tests
```

## Data Location

Claude Code stores transcripts at:
```
~/.claude/projects/<project-path>/<session-id>.jsonl
~/.claude/projects/<project-path>/subagents/agent-<id>.jsonl
```

Sessions are NOT auto-deleted - they accumulate indefinitely.

## Future Plans

- [x] ~~Session history trends over time~~ (aggregate command)
- [x] ~~Optimization suggestions (auto-detect inefficient patterns)~~ (insights)
- [ ] HTML dashboard for visual exploration
- [ ] Hook integration for auto-analysis after sessions
- [ ] Tauri desktop app using JSON output from aggregate

## License

MIT
