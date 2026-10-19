# AGENTS.md — REA Studio

> Canonical reference for any AI agent working on this codebase.
> Keep this file and `CLAUDE.md` in sync (they must be identical).

---

## 1  Goal

REA Studio is a polished, chat-style **desktop application** (Electron) where
the user:

1. **Picks or drags in a target** — app folder, ASAR archive, native binary,
   APK, HAR capture, URL, .NET assembly, firmware image, etc.
2. **Chats with an AI agent** that investigates the target using
   [REA](https://github.com/morluto/rea)'s MCP tools.
3. **Sees every tool call**, its inputs, and its evidence rendered in readable
   cards inside the chat timeline.
4. **Approves risky actions** — anything that would *execute* the target must
   be explicitly approved by the user in the UI before the agent proceeds.
5. **Exports findings** as a Markdown report.

---

## 2  Stack

| Layer | Technology |
|---|---|
| Shell | Electron (latest stable) |
| Build | Vite |
| UI | React + TypeScript (strict) |
| Styling | Tailwind CSS |
| State | Zustand |
| Agent loop | Claude Agent SDK (Anthropic) |
| REA integration | MCP server over stdio |
| IPC validation | Zod |
| Unit tests | Vitest |
| E2E / smoke | Playwright (Electron) |
| Package manager | npm |

> **Do not swap any of the above without asking the user first.**

---

## 3  Architecture Rules

### 3.1  Security — Renderer Isolation

- `contextIsolation`: **ON**
- `nodeIntegration`: **OFF**
- `sandbox`: **ON**
- All privileged work happens in the **main process** behind a typed
  **preload API** (`contextBridge.exposeInMainWorld`).
- Every IPC payload (both directions) is validated with a **Zod schema**
  before use.

### 3.2  Secrets

- The model-provider API key is stored via the **OS keychain** (Electron
  `safeStorage` or `keytar`).
- The key is **never** written to plain-text files, **never** logged, and
  **never** sent to the renderer process.

### 3.3  Privacy & Network

- Everything runs **locally**. No telemetry. No analytics.
- The only outbound network calls are to the **model provider** the user
  configured (e.g. Anthropic API).

### 3.4  Target Safety

- **Never execute** a user-supplied target unless the user has approved that
  **specific action** in the UI (a confirmation dialog per tool invocation).
- The approval gate lives in the **main process**; the renderer only renders
  the request and relays the user's decision.

### 3.5  REA Fidelity

- Never invent REA commands, tool names, or SDK APIs.
- Read the installed types / docs first. If something is unknown, stop and
  ask the user.

---

## 4  Folder Layout

```
rea-studio/
├── .agents/                   # Workspace-level agent customizations
│   ├── rules/
│   └── skills/
├── electron/
│   ├── main.ts                # Electron main process entry
│   ├── preload.ts             # Typed preload (contextBridge)
│   ├── ipc/
│   │   ├── handlers.ts        # IPC handler registrations
│   │   └── schemas.ts         # Zod schemas for every IPC channel
│   ├── agent/
│   │   ├── loop.ts            # Claude Agent SDK orchestration
│   │   ├── mcp-client.ts      # Spawns REA MCP server (stdio)
│   │   └── approval.ts        # Risky-action approval gate
│   └── keychain.ts            # safeStorage / keytar wrapper
├── src/                       # Renderer (React)
│   ├── main.tsx               # React entry
│   ├── App.tsx
│   ├── components/
│   │   ├── Chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ToolCallCard.tsx
│   │   │   └── ApprovalPrompt.tsx
│   │   ├── Sidebar/
│   │   │   ├── SessionList.tsx
│   │   │   └── TargetPicker.tsx
│   │   ├── Settings/
│   │   │   └── SettingsModal.tsx
│   │   └── Export/
│   │       └── ExportButton.tsx
│   ├── hooks/
│   ├── store/                 # Zustand stores
│   │   ├── chatStore.ts
│   │   └── settingsStore.ts
│   ├── lib/
│   │   └── ipc.ts             # Typed wrapper around window.api.*
│   ├── types/
│   │   └── index.ts           # Shared renderer-side types
│   └── index.css              # Tailwind directives + custom tokens
├── tests/
│   ├── unit/                  # Vitest
│   └── e2e/                   # Playwright Electron smoke test
├── AGENTS.md                  # ← this file
├── CLAUDE.md                  # exact copy of AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── .gitignore
```

---

## 5  Definition of Done — Per Feature

Every feature PR must satisfy **all** general gates plus its feature-specific
checklist.

### 5.0  General Gates (apply to every change)

- [ ] `npm run typecheck` passes with zero errors (strict mode).
- [ ] `npm run lint` passes with zero warnings.
- [ ] `npm run test` (Vitest) passes — no skipped tests without a comment.
- [ ] `npm run test:e2e` (Playwright smoke) passes.
- [ ] No secrets in source, logs, or IPC payloads.
- [ ] Manual-test steps documented in the PR description.

---

### 5.1  Feature: Target Picker / Drag-and-Drop

- [ ] User can click "Open" to pick a file/folder via native dialog.
- [ ] User can drag a file/folder onto the window and see a drop-zone
      highlight.
- [ ] Accepted paths are forwarded to the main process via validated IPC.
- [ ] Invalid targets show a toast with a human-readable error.
- [ ] **Manual test:** drag an `.asar`, a folder, and an `.apk`; verify each
      is accepted and displayed in the sidebar.

### 5.2  Feature: Chat UI

- [ ] Messages render in a scrollable timeline (user bubbles right, agent
      bubbles left).
- [ ] Streaming tokens appear progressively (no flash-of-content).
- [ ] Markdown in agent messages is rendered (headings, code blocks, lists).
- [ ] Chat auto-scrolls to the latest message but allows scroll-lock on
      manual scroll-up.
- [ ] **Manual test:** send a message, observe streaming, scroll up during
      response, verify scroll-lock, scroll to bottom after response ends.

### 5.3  Feature: Tool-Call Cards

- [ ] Each tool invocation renders as a collapsible card in the timeline.
- [ ] Card shows: tool name, inputs (formatted JSON), status (running /
      success / error), and evidence/output.
- [ ] Cards are visually distinct from chat bubbles.
- [ ] **Manual test:** trigger a multi-tool agent turn; expand and collapse
      each card; verify inputs and outputs are accurate.

### 5.4  Feature: Risky-Action Approval

- [ ] Tool calls tagged as risky surface an approval prompt **before**
      execution.
- [ ] The agent loop is paused until the user clicks Approve or Deny.
- [ ] Deny sends a refusal back to the agent, which should explain and
      continue without executing.
- [ ] Approval state is never auto-granted or cached.
- [ ] **Manual test:** trigger a `run_target` (or equivalent risky) tool
      call; deny once and verify non-execution; approve once and verify
      execution.

### 5.5  Feature: API-Key Management

- [ ] Settings modal lets the user enter/update their API key.
- [ ] Key is persisted via `safeStorage` (or `keytar`), not in config files.
- [ ] Key is never present in renderer memory, logs, or DevTools.
- [ ] On first launch with no key, the app prompts the user before allowing
      chat.
- [ ] **Manual test:** set a key, restart the app, verify the key is still
      available; open DevTools and search for the key string — must not
      appear.

### 5.6  Feature: Markdown Export

- [ ] "Export" button generates a `.md` file from the current session.
- [ ] Export includes: target info, all agent messages, tool-call
      summaries, and evidence.
- [ ] User is shown a native Save dialog to choose the output path.
- [ ] **Manual test:** run a short session, export, open the `.md` in a
      viewer, verify formatting and completeness.

### 5.7  Feature: Session Management (Sidebar)

- [ ] Sidebar lists past sessions with target name and timestamp.
- [ ] Clicking a session loads its history into the chat window.
- [ ] User can start a new session (clears chat, resets agent state).
- [ ] Sessions persist across app restarts (local storage or SQLite).
- [ ] **Manual test:** create two sessions with different targets; switch
      between them; restart app and verify both are intact.

### 5.8  Feature: Electron Smoke Test (Playwright)

- [ ] A single Playwright test launches the packaged Electron app.
- [ ] Verifies the window opens, the chat input is visible, and a message
      can be typed.
- [ ] Runs in CI (headless).
- [ ] **Manual test:** `npm run test:e2e` exits 0 on a clean checkout.

---

## 6  Conventions

- **Commits**: conventional-commits style (`feat:`, `fix:`, `chore:`, etc.).
- **Branches**: `feat/<name>`, `fix/<name>`, `chore/<name>`.
- **File naming**: `PascalCase.tsx` for React components, `camelCase.ts` for
  everything else.
- **Imports**: use `@/` path alias mapped to `src/`.
- **Error handling**: all IPC handlers must return a discriminated union
  `{ ok: true; data: T } | { ok: false; error: string }`.
