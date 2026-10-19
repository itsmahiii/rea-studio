# REA Studio

A polished, chat-style desktop app for reverse-engineering anything — powered
by [REA](https://github.com/morluto/rea) and Claude.

![Status](https://img.shields.io/badge/status-pre--alpha-orange)

---

## What It Does

1. **Pick or drag in a target** — native binary, Electron ASAR, .NET
   assembly, Android APK, HAR capture, URL, firmware image, or app folder.
2. **Chat with an AI agent** that investigates the target using REA's MCP
   tools (decompile, disassemble, inspect, diff, and more).
3. **See every tool call** rendered as a readable evidence card in the chat
   timeline — inputs, outputs, status, and limitations.
4. **Approve risky actions** before they execute — nothing runs the target
   without your explicit consent.
5. **Export findings** as a clean Markdown report.

## Stack

| Layer | Tech |
|---|---|
| Shell | Electron (latest stable) |
| Build | Vite |
| UI | React · TypeScript (strict) · Tailwind CSS |
| State | Zustand |
| Agent | Claude Agent SDK (Anthropic) |
| RE backend | REA MCP server (stdio) |
| Validation | Zod |
| Tests | Vitest · Playwright |

## Security Highlights

- **Renderer sandbox ON** — `contextIsolation`, no `nodeIntegration`.
- **API key in OS keychain** — never in config files or logs.
- **Zero telemetry** — only outbound call is to the model provider you chose.
- **Explicit approval** required before executing any target.

## Getting Started

> 🚧 **Pre-alpha** — setup instructions will be added once the scaffold is in
> place.

```bash
# (placeholder — not yet functional)
npm install
npm run dev
```

## Project Structure

See [`AGENTS.md`](./AGENTS.md) for the full folder layout, architecture rules,
and per-feature definition-of-done checklists.

## License

TBD
