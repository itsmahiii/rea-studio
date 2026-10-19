# Claude Agent SDK Notes for REA Studio

> Verified against installed package `@anthropic-ai/claude-agent-sdk` (v0.3.302)
> Source files: `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts` and `core.d.ts`
> Verified: 2026-10-18

---

## 1  Core Query Function

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

const queryInstance: Query = query({
  prompt: string | AsyncIterable<SDKUserMessage>,
  options?: Options
});
```

`Query` extends `AsyncGenerator<SDKMessage, void>`.

### Controlling execution
- **`queryInstance.close()`**: Forcefully terminates the query and underlying subprocess. No further messages will be received.
- **`queryInstance.interrupt()`**: Sends an interrupt control request to abort the current turn and return control to the caller.
- **`queryInstance.streamInput(stream)`**: Streams multi-turn user messages to the ongoing session.
- **`options.abortController`**: Standard `AbortController` passed in `options`. Calling `abortController.abort()` cancels the query.

---

## 2  Registering REA MCP Server (stdio)

In `options.mcpServers`:
```typescript
options.mcpServers = {
  rea: {
    type: 'stdio',
    command: process.platform === 'win32' ? 'cmd.exe' : 'npx',
    args: process.platform === 'win32'
      ? ['/d', '/c', 'npx', '-y', 'rea-agents@6.7.0', 'mcp']
      : ['-y', 'rea-agents@6.7.0', 'mcp'],
    env: {
      ...process.env,
      // REA environment configurations
      NODE_NO_WARNINGS: '1',
    },
    timeout: 120_000,
    alwaysLoad: true,
  }
};
```

To enforce that **only** REA tools are used:
- `options.strictMcpConfig = true`: Ignores project `.mcp.json`, user settings, and plugins.
- `options.tools = []`: Disables all built-in tools (`Bash`, `Read`, `Edit`, `Glob`, `Grep`).
- `options.settingSources = []`: Disables loading filesystem settings (`~/.claude/settings.json`, etc.) for complete SDK isolation.

---

## 3  Tool Restriction & Tool Naming

- **Built-in tools**: Set `options.tools = []` to disable all host tools.
- **MCP tool names**: Tools served by an MCP server are presented to the agent as `mcp__<serverName>__<toolName>` or `<toolName>` when alias or server policy applies.
- **Allow list**: Allowed tools can be specified in `options.allowedTools`.

---

## 4  Permission & Approval Callback (`canUseTool`)

The SDK provides a first-class `canUseTool` hook in `Options`:

```typescript
options.canUseTool = async (
  toolName: string,
  input: Record<string, unknown>,
  context: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    mcpServer?: { name: string; source: string };
    decisionReason?: string;
    title?: string;
    displayName?: string;
    description?: string;
    defaultToNo?: boolean;
    toolUseID: string;
    requestId: string;
  }
): Promise<PermissionResult | null> => {
  // Check if tool is risky:
  if (isRiskyTool(toolName)) {
    const userApproved = await askUserApproval(toolName, input, context);
    if (!userApproved) {
      return {
        behavior: 'deny',
        message: 'Action denied by user in REA Studio approval gate.',
      };
    }
  }
  return { behavior: 'allow' };
};
```

Configuration requirements for interactive permissions:
- `options.permissionMode = 'default'`
- `options.permissionPrompts = 'host'`

---

## 5  Resuming Sessions

- **`options.sessionId`**: Specify an explicit session UUID.
- **`options.resume = sessionId`**: Resumes conversation history from an existing session.
- **`options.forkSession?: boolean`**: When true, forks to a new session ID rather than continuing the previous session in place.
- **`options.persistSession = false`** when delegating persistence to our local SQLite / JSON store.

---

## 6  Message Normalization (`SDKMessage`)

The SDK yields `SDKMessage` union instances:
- `SDKPartialAssistantMessage` (`type === 'stream_event'`):
  - `event.type === 'content_block_delta'` with `delta.type === 'text_delta'` -> emit `assistant_text_delta`.
- `SDKAssistantMessage` (`type === 'assistant'`):
  - `message.content` array containing:
    - Text blocks: final assistant response text.
    - `tool_use` blocks: `{ type: 'tool_use', id, name, input }` -> emit `tool_call_started`.
- `SDKUserMessage` (`type === 'user'`):
  - Tool result blocks: `{ type: 'tool_result', tool_use_id, content, is_error }` -> emit `tool_call_result` / `tool_call_error`.
- `SDKResultMessage` (`type === 'result'`):
  - `subtype === 'success'` -> emit `run_finished`.
  - `subtype !== 'success'` or `is_error === true` -> emit `run_error`.
- `SDKStatusMessage` / `SDKSystemMessage`:
  - Internal status and diagnostics.
