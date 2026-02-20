# CtxMap Hook Configuration

This directory contains optional hooks for auto-analyzing Claude Code sessions.

## Stop Hook (Post-Session Analysis)

To automatically analyze your session when it ends, add the following to your Claude Code settings:

### Option 1: Global Hook

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "npx ctxmap analyze --latest" }]
    }]
  }
}
```

### Option 2: Project-Specific Hook

Add to `.claude/settings.local.json` in your project:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "",
      "hooks": [{ "type": "command", "command": "npx ctxmap analyze --latest" }]
    }]
  }
}
```

## Installation

1. Install CtxMap globally:
   ```bash
   npm install -g ctxmap
   ```

   Or run directly with npx:
   ```bash
   npx ctxmap analyze --latest
   ```

2. Configure the hook as described above

3. Your sessions will be automatically analyzed when they end
