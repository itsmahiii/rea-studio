# REA Studio v1.0.0

A polished, chat-style desktop application for reverse-engineering anything — powered by REA and modern LLM agents.

### Highlights
- **Multi-Provider LLM Support**: Built-in support for Anthropic Claude (Claude Agent SDK), OpenAI (`gpt-4o`, `o3-mini`), Google Gemini, OpenRouter, and local Ollama/LM Studio models (`http://localhost:11434/v1`).
- **Comprehensive REA Integration**: Dynamic MCP tool calling across static and dynamic analysis workflows (ELF, Mach-O, PE, APK, ASAR, Web bundles, SQLite, memory dumps, and disassembly).
- **Zero-Trust Permission Gate**: Risky tools and target execution actions are strictly held in the main process until explicitly approved by the user in the UI.
- **OS Keychain Encryption**: API keys are securely encrypted via Electron `safeStorage` (Windows DPAPI / macOS Keychain / Linux Secret Service) and never exposed to the renderer or plain-text files.
- **Interactive UI**: Live token streaming, collapsible tool execution cards with formatted inputs/evidence, session persistence, and Markdown report export.

### Included Windows Asset
- **`REA Studio Setup 1.0.0.exe`** — Windows x64 NSIS Installer (Standalone setup with desktop shortcut and uninstaller)
