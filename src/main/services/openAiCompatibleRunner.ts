/**
 * openAiCompatibleRunner.ts
 *
 * Universal runner for OpenAI-compatible LLM endpoints:
 * - OpenAI (api.openai.com)
 * - Google Gemini (generativelanguage.googleapis.com/v1beta/openai)
 * - OpenRouter (openrouter.ai/api/v1)
 * - Ollama / Local LLMs (localhost:11434/v1)
 *
 * Handles Server-Sent Events (SSE) streaming, REA MCP tool calling,
 * and user permission approval gating.
 */

export interface OpenAiCompatibleMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface OpenAiToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface OpenAiCompatibleRunnerParams {
  provider: 'openai' | 'gemini' | 'openrouter' | 'ollama';
  baseUrl?: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  history: Array<{ role: string; content: string }>;
  prompt: string;
  tools: OpenAiToolDefinition[];
  signal?: AbortSignal;
  fetchFn?: typeof fetch;
  onDelta: (delta: string) => void;
  onToolCallStart: (callId: string, name: string, input: unknown) => void;
  onToolCallResult: (callId: string, name: string, input: unknown, result: unknown) => void;
  onToolCallError: (callId: string, name: string, input: unknown, error: string) => void;
  checkPermission: (name: string, input: unknown) => Promise<boolean>;
  executeTool: (name: string, input: unknown) => Promise<unknown>;
}

export function resolveEndpoint(provider: string, baseUrlOverride?: string): string {
  if (baseUrlOverride && baseUrlOverride.trim().length > 0) {
    let base = baseUrlOverride.trim().replace(/\/+$/, '');
    if (!base.endsWith('/chat/completions')) {
      base = `${base}/chat/completions`;
    }
    return base;
  }

  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/chat/completions';
    case 'ollama':
      return 'http://localhost:11434/v1/chat/completions';
    default:
      return 'https://api.openai.com/v1/chat/completions';
  }
}

export function resolveAuthHeaders(
  provider: string,
  apiKey: string
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/itsmahiii/rea-studio';
    headers['X-Title'] = 'REA Studio';
  }

  return headers;
}

/**
 * Execute a multi-turn turn loop with tool calling and SSE streaming.
 */
export async function runOpenAiCompatibleTurn(
  params: OpenAiCompatibleRunnerParams
): Promise<string> {
  const customFetch = params.fetchFn ?? fetch;
  const endpoint = resolveEndpoint(params.provider, params.baseUrl);
  const headers = resolveAuthHeaders(params.provider, params.apiKey);

  // Format tools into OpenAI format
  const formattedTools = params.tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description || `REA tool: ${t.name}`,
      parameters: t.inputSchema || { type: 'object', properties: {} },
    },
  }));

  // Build initial message history
  const messages: OpenAiCompatibleMessage[] = [
    { role: 'system', content: params.systemPrompt },
  ];

  for (const h of params.history) {
    if (h.role === 'user' || h.role === 'assistant') {
      messages.push({
        role: h.role,
        content: h.content,
      });
    }
  }

  messages.push({
    role: 'user',
    content: params.prompt,
  });

  const maxTurns = 20; // safety ceiling
  let currentTurn = 0;
  let finalAssistantContent = '';

  while (currentTurn < maxTurns) {
    currentTurn++;

    const payload: Record<string, unknown> = {
      model: params.model,
      messages,
      stream: true,
    };

    if (formattedTools.length > 0) {
      payload.tools = formattedTools;
      payload.tool_choice = 'auto';
    }

    const response = await customFetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: params.signal,
    });

    if (!response.ok) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        // ignore
      }
      throw new Error(
        `Provider (${params.provider}) returned HTTP ${response.status}: ${errBody || response.statusText}`
      );
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot stream SSE chunks.');
    }

    // Process SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let turnContent = '';
    const pendingToolCalls: Map<
      number,
      { id: string; name: string; arguments: string }
    > = new Map();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;
            if (delta?.content) {
              turnContent += delta.content;
              params.onDelta(delta.content);
            }

            if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0;
                if (!pendingToolCalls.has(index)) {
                  pendingToolCalls.set(index, {
                    id: tc.id || `call_${Date.now()}_${index}`,
                    name: tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  });
                } else {
                  const existing = pendingToolCalls.get(index)!;
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name += tc.function.name;
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
              }
            }
          } catch {
            // ignore JSON parse errors in malformed stream chunks
          }
        }
      }
    }

    if (turnContent) {
      finalAssistantContent = turnContent;
    }

    // Check if there are tool calls to execute
    const toolCallsList = Array.from(pendingToolCalls.values()).filter(
      (tc) => tc.name.length > 0
    );

    if (toolCallsList.length === 0) {
      // Turn complete: model emitted a final response without tool calls
      break;
    }

    // Record the assistant's message with tool calls
    messages.push({
      role: 'assistant',
      content: turnContent || null,
      tool_calls: toolCallsList.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    });

    // Execute each tool call sequentially
    for (const tc of toolCallsList) {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        parsedArgs = { raw: tc.arguments };
      }

      params.onToolCallStart(tc.id, tc.name, parsedArgs);

      // 1. Permission gate
      const allowed = await params.checkPermission(tc.name, parsedArgs);
      if (!allowed) {
        const errorMsg = 'Tool execution denied by user policy.';
        params.onToolCallError(tc.id, tc.name, parsedArgs, errorMsg);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify({ error: errorMsg }),
        });
        continue;
      }

      // 2. Execute on REA MCP server
      try {
        const result = await params.executeTool(tc.name, parsedArgs);
        params.onToolCallResult(tc.id, tc.name, parsedArgs, result);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        params.onToolCallError(tc.id, tc.name, parsedArgs, errorMsg);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: JSON.stringify({ error: errorMsg }),
        });
      }
    }
  }

  return finalAssistantContent;
}
