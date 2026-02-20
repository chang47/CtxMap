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

- [ ] HTML dashboard for visual exploration
- [ ] Session history trends over time
- [ ] Optimization suggestions (auto-detect inefficient patterns)
- [ ] Hook integration for auto-analysis after sessions

## License

MIT
