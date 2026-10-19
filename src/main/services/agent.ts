import * as crypto from 'crypto';
import { query as defaultSdkQuery } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  Options,
  SDKMessage,
  SDKUserMessage,
  PermissionResult,
  McpStdioServerConfig,
} from '@anthropic-ai/claude-agent-sdk';
import { buildSystemPrompt, type SystemPromptContext } from '../prompts/system';
import { ALL_REA_TOOLS, isRiskyTool, cleanToolName } from './reaTools';
import { keychain } from '../keychain';
import { sessionService } from './session';
import { settingsService } from './settings';
import { processManager } from './processManager';
import { resolveReaMcpCommand } from './pathResolver';
import type {
  AgentEvent,
  AssistantTextDeltaEvent,
  ToolCallStartedEvent,
  ToolCallResultEvent,
  ToolCallErrorEvent,
  PermissionRequestEvent,
  RunFinishedEvent,
  RunErrorEvent,
} from '../../shared/events';

export type EventListener = (event: AgentEvent) => void;

export type SdkQueryFn = (params: {
  prompt: string | AsyncIterable<SDKUserMessage>;
  options?: Options;
}) => Query;

export interface AgentServiceOptions {
  queryRunner?: SdkQueryFn;
  approvalTimeoutMs?: number;
}

interface PendingApproval {
  resolve: (result: PermissionResult) => void;
  timer: NodeJS.Timeout;
}

export class AgentService {
  private queryRunner: SdkQueryFn;
  private approvalTimeoutMs: number;
  private activeQuery: Query | null = null;
  private abortController: AbortController | null = null;
  private activeSessionId: string | null = null;
  private activeTargetContext: SystemPromptContext | null = null;
  private pendingApprovals = new Map<string, PendingApproval>();
  private listeners = new Set<EventListener>();
  private mcpCrashCount = 0;

  constructor(options?: AgentServiceOptions) {
    this.queryRunner = options?.queryRunner ?? defaultSdkQuery;
    this.approvalTimeoutMs = options?.approvalTimeoutMs ?? 60_000;
  }

  /**
   * Register event listener for normalized Agent events.
   * Returns an unsubscribe function.
   */
  public onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in agent event listener:', err);
      }
    }
  }

  /**
   * Start or initialize an analysis session for a target.
   */
  public async startSession(targetContext: {
    path: string;
    name: string;
    targetType: string;
    provider?: string;
  }): Promise<string> {
    const session = sessionService.create(
      targetContext.path,
      targetContext.name,
      targetContext.targetType,
      targetContext.provider
    );

    this.activeSessionId = session.id;
    this.activeTargetContext = {
      targetPath: targetContext.path,
      targetName: targetContext.name,
      targetType: targetContext.targetType,
      provider: targetContext.provider,
      os: process.platform,
    };

    return session.id;
  }

  /**
   * Resume an existing session by ID.
   */
  public async resume(sessionId: string): Promise<boolean> {
    const session = sessionService.get(sessionId);
    if (!session) {
      return false;
    }

    this.activeSessionId = session.id;
    this.activeTargetContext = {
      targetPath: session.target.path,
      targetName: session.target.name,
      targetType: session.target.targetType,
      provider: session.provider,
      os: process.platform,
    };

    return true;
  }

  /**
   * Send a user message to the active session and orchestrate the agent run.
   */
  public async sendMessage(text: string): Promise<void> {
    if (!this.activeSessionId || !this.activeTargetContext) {
      throw new Error('No active session. Call startSession() or resume() first.');
    }

    const sessionId = this.activeSessionId;

    // 1. Validate API Key
    const apiKey = keychain.getApiKey() || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      const errorMsg = 'Model provider API key is not configured. Please set your API key in Settings.';
      this.emit({
        type: 'run_error',
        sessionId,
        error: errorMsg,
      });
      return;
    }

    // Persist user prompt in local session store
    sessionService.addMessage(sessionId, {
      sessionId,
      role: 'user',
      content: text,
    });

    await this.runTurnWithRetry(sessionId, text, apiKey);
  }

  /**
   * Cancel an in-flight query execution.
   */
  public cancel(): void {
    if (this.activeQuery) {
      try {
        this.activeQuery.close();
      } catch (err) {
        console.warn('Error closing active query:', err);
      }
      this.activeQuery = null;
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Deny all pending approvals
    for (const [id, pending] of this.pendingApprovals) {
      clearTimeout(pending.timer);
      pending.resolve({
        behavior: 'deny',
        message: 'Action cancelled by user.',
      });
      this.pendingApprovals.delete(id);
    }

    if (this.activeSessionId) {
      this.emit({
        type: 'run_error',
        sessionId: this.activeSessionId,
        error: 'Run cancelled by user.',
      });
    }
  }

  /**
   * Complete lifecycle cleanup: aborts running turn and kills any child processes.
   */
  public cleanup(): void {
    this.cancel();
    processManager.killAll();
  }

  /**
   * Respond to a permission prompt from the UI.
   */
  public respondPermission(approvalId: string, allow: boolean): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pendingApprovals.delete(approvalId);

    if (allow) {
      pending.resolve({ behavior: 'allow' });
    } else {
      pending.resolve({
        behavior: 'deny',
        message: 'Permission denied by user in REA Studio approval gate.',
      });
    }

    return true;
  }

  /**
   * Builds REA MCP Server stdio configuration using 3-tier lookup order:
   * 1. Settings override -> 2. System PATH -> 3. Common install directories
   */
  private buildReaMcpConfig(): McpStdioServerConfig {
    const settings = settingsService.getSettings();
    const resolved = resolveReaMcpCommand(settings.reaCommandOverride);

    if (!resolved.isAvailable && resolved.error) {
      const fullError = `${resolved.error}\n\nFix Hint:\n${resolved.fixHint}`;
      console.error(fullError);
      throw new Error(fullError);
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      PATH: resolved.enrichedPath,
      NODE_NO_WARNINGS: '1',
    };

    if (settings.envOverrides) {
      if (settings.envOverrides.REA_GHIDRA_STARTUP_TIMEOUT_MS) {
        env.REA_GHIDRA_STARTUP_TIMEOUT_MS = String(settings.envOverrides.REA_GHIDRA_STARTUP_TIMEOUT_MS);
      }
      if (settings.envOverrides.REA_HOPPER_STARTUP_TIMEOUT_MS) {
        env.REA_HOPPER_STARTUP_TIMEOUT_MS = String(settings.envOverrides.REA_HOPPER_STARTUP_TIMEOUT_MS);
      }
      if (settings.envOverrides.REA_JEB_MCP_URL) {
        env.REA_JEB_MCP_URL = settings.envOverrides.REA_JEB_MCP_URL;
      }
      if (settings.envOverrides.REA_MCP_MAX_RESPONSE_BYTES) {
        env.REA_MCP_MAX_RESPONSE_BYTES = String(settings.envOverrides.REA_MCP_MAX_RESPONSE_BYTES);
      }
    }

    const timeout = (settings.analysisTimeoutSeconds || 120) * 1000;

    return {
      type: 'stdio',
      command: resolved.command,
      args: resolved.args,
      env,
      timeout,
      alwaysLoad: true,
    };
  }

  /**
   * Executes a turn with auto-restart on MCP server crash (retries once).
   */
  private async runTurnWithRetry(
    sessionId: string,
    prompt: string,
    apiKey: string
  ): Promise<void> {
    const maxRetries = 1;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        await this.executeTurn(sessionId, prompt, apiKey);
        this.mcpCrashCount = 0;
        return;
      } catch (err: unknown) {
        attempt++;
        const errMsg = err instanceof Error ? err.message : String(err);
        const isCrash = errMsg.includes('MCP') || errMsg.includes('ECONNRESET') || errMsg.includes('exit');

        if (isCrash && attempt <= maxRetries) {
          console.warn(`REA MCP server crashed. Attempting auto-restart (attempt ${attempt}/${maxRetries})...`);
          this.mcpCrashCount++;
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        this.emit({
          type: 'run_error',
          sessionId,
          error: `Execution error: ${errMsg}`,
        });
        return;
      }
    }
  }

  private async executeTurn(
    sessionId: string,
    prompt: string,
    apiKey: string
  ): Promise<void> {
    if (!this.activeTargetContext) return;

    this.abortController = new AbortController();

    const settings = settingsService.getSettings();
    const resolvedModel =
      settings.selectedModel === 'custom' && settings.customModel
        ? settings.customModel
        : settings.selectedModel || 'claude-3-7-sonnet-20250219';

    const options: Options = {
      model: resolvedModel,
      abortController: this.abortController,
      env: {
        ...process.env,
        ANTHROPIC_API_KEY: apiKey,
      },
      // 1. Restrict to REA MCP Server only
      mcpServers: {
        rea: this.buildReaMcpConfig(),
      },
      strictMcpConfig: true,

      // 2. Disable built-in tools (Bash, Read, Edit, Glob, Grep)
      tools: [],

      // 3. Clean isolation from user/project settings
      settingSources: [],

      // 4. System prompt
      systemPrompt: buildSystemPrompt(this.activeTargetContext),

      // 5. Enable streaming partial messages
      includePartialMessages: true,

      // 6. Permission approval gate
      permissionMode: 'default',
      permissionPrompts: 'host',
      canUseTool: async (toolName, input, context) => {
        return this.handleToolPermission(sessionId, toolName, input, context);
      },

      // 7. Session persistence handled by our own local store
      persistSession: false,
    };

    const queryInstance = this.queryRunner({
      prompt,
      options,
    });
    this.activeQuery = queryInstance;

    let accumulatedText = '';

    try {
      for await (const message of queryInstance) {
        this.processSdkMessage(sessionId, message, (delta) => {
          accumulatedText += delta;
        });
      }

      // Persist agent response
      if (accumulatedText.trim()) {
        sessionService.addMessage(sessionId, {
          sessionId,
          role: 'agent',
          content: accumulatedText,
        });
      }

      this.emit({
        type: 'run_finished',
        sessionId,
        fullText: accumulatedText,
      });
    } finally {
      this.activeQuery = null;
      this.abortController = null;
    }
  }

  /**
   * Permission gate checking tool classification from REA_FACTS.md §4.2.
   */
  private async handleToolPermission(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    context: { title?: string; description?: string }
  ): Promise<PermissionResult> {
    const rawToolName = cleanToolName(toolName);

    // If static safe tool, auto-allow without prompt
    if (!isRiskyTool(rawToolName)) {
      return { behavior: 'allow' };
    }

    // Risky tool: pause and request user confirmation
    const approvalId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + this.approvalTimeoutMs).toISOString();
    const description =
      context.title ||
      context.description ||
      `This tool execution (${rawToolName}) interacts with or executes the target. User approval required.`;

    const permissionPromise = new Promise<PermissionResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(approvalId);
        resolve({
          behavior: 'deny',
          message: 'Permission request timed out (default deny).',
        });
      }, this.approvalTimeoutMs);

      this.pendingApprovals.set(approvalId, { resolve, timer });
    });

    this.emit({
      type: 'permission_request',
      approvalId,
      sessionId,
      toolName: rawToolName,
      input,
      description,
      expiresAt,
    });

    return permissionPromise;
  }

  /**
   * Normalizes raw SDK messages into typed UI events.
   */
  private processSdkMessage(
    sessionId: string,
    msg: SDKMessage,
    onTextDelta: (delta: string) => void
  ): void {
    // 1. Streaming text deltas
    if (msg.type === 'stream_event') {
      const rawEvent = (msg as { event?: { type: string; delta?: { type: string; text?: string } } }).event;
      if (rawEvent?.type === 'content_block_delta' && rawEvent.delta?.type === 'text_delta') {
        const textDelta = rawEvent.delta.text || '';
        if (textDelta) {
          onTextDelta(textDelta);
          this.emit({
            type: 'assistant_text_delta',
            sessionId,
            textDelta,
          });
        }
      }
      return;
    }

    // 2. Assistant messages with tool calls
    if (msg.type === 'assistant') {
      const assistantMsg = msg as {
        message?: { content?: Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }> };
      };
      const blocks = assistantMsg.message?.content || [];

      for (const block of blocks) {
        if (block.type === 'tool_use' && block.name && block.id) {
          const rawName = cleanToolName(block.name);
          const isRisky = isRiskyTool(rawName);

          this.emit({
            type: 'tool_call_started',
            sessionId,
            toolCallId: block.id,
            toolName: rawName,
            input: block.input || {},
            isRisky,
          });
        }
      }
      return;
    }

    // 3. User messages with tool results
    if (msg.type === 'user') {
      const userMsg = msg as {
        message?: { content?: Array<{ type: string; tool_use_id?: string; content?: unknown; is_error?: boolean }> };
      };
      const blocks = userMsg.message?.content || [];

      for (const block of blocks) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          if (block.is_error) {
            this.emit({
              type: 'tool_call_error',
              sessionId,
              toolCallId: block.tool_use_id,
              error: typeof block.content === 'string' ? block.content : JSON.stringify(block.content),
            });
          } else {
            this.emit({
              type: 'tool_call_result',
              sessionId,
              toolCallId: block.tool_use_id,
              output: block.content,
            });
          }
        }
      }
      return;
    }

    // 4. Result message
    if (msg.type === 'result') {
      const resultMsg = msg as { subtype?: string; is_error?: boolean; result?: string; error?: string };
      if (resultMsg.is_error || resultMsg.subtype !== 'success') {
        this.emit({
          type: 'run_error',
          sessionId,
          error: resultMsg.error || resultMsg.result || 'Agent turn ended with error.',
        });
      }
    }
  }
}

export const agentService = new AgentService();
