# CtxMap - Claude Code Context

## What This Project Does

CtxMap is a CLI tool for analyzing Claude Code token usage from JSONL transcript files. It provides:

- **Per-action token attribution** - See which tool calls/files add the most tokens
- **Context window tracking** - Monitor how full your context is, detect degradation zones
- **Cost estimation** - Calculate costs from token counts
- **Turn-by-turn breakdown** - Like Chrome DevTools timeline for tokens
- **Compact detection** - Identify when context was compacted and how much was saved
- **Mass aggregation** - Aggregate all sessions to find patterns and insights
- **File interaction tracking** - See combined Read/Edit/Write stats per file
- **High churn detection** - Identify files edited frequently across sessions
- **Interactive dashboard** - Visualize token usage with charts and tables

## Key Commands

```bash
# Build the project
npm run build

# Run tests
npm test

# Type check + tests
npm run check:all

# Analyze latest session
ctxmap analyze --latest

# Turn-by-turn breakdown (most detailed view)
ctxmap turns --latest

# List all sessions
ctxmap sessions

# Compare multiple sessions
ctxmap compare --latest 5

# Mass aggregation with pattern detection
ctxmap aggregate
ctxmap aggregate --since 2025-01-01
ctxmap aggregate --format json

# Interactive dashboard
ctxmap serve
ctxmap serve -p 8080
ctxmap serve --project CodeSignal
```

## Output Formats

All commands support `--format json|markdown` for export.

## Architecture

```
src/
├── core/
│   ├── types.ts       # Type definitions (Turn, SessionReport, MassAggregation, FileInteractionPattern, etc.)
│   ├── parser.ts      # JSONL parsing, turn extraction
│   ├── attribution.ts # Token delta calculation, aggregation, compact detection
│   └── aggregation.ts # Cross-session aggregation, pattern detection, file interaction tracking
├── cli/
│   ├── index.ts       # CLI entry point (analyze, turns, sessions, compare, aggregate, serve)
│   ├── formatters.ts  # Output formatting (tables, colors, bars)
│   └── server.ts      # Dashboard server (generates data.json, starts Vite)
└── web/               # React dashboard
    ├── App.tsx        # Main app with tab navigation
    ├── components/    # Overview, Timeline, FileTable, ToolBreakdown, Insights
    └── hooks/         # useAggregation hook for data fetching
```

## Key Concepts

- **Session** = One full conversation (one JSONL file in `~/.claude/projects/`)
- **Turn** = One assistant message with token usage data
- **FileInteractionPattern** = Combined Read/Edit/Write stats for a file across all sessions
- A single user message can result in multiple turns (if Claude makes tool calls)

## Data Source

Claude Code stores transcripts at:
```
~/.claude/projects/<project-path>/<session-id>.jsonl
```

## Token Calculation

```typescript
context = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
delta = currentContext - previousContext
```

Note: Due to caching, `input_tokens` can be 0 when content is served from cache. Tool result size (KB) is also tracked as an alternative metric.
