import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveEndpoint,
  resolveAuthHeaders,
  runOpenAiCompatibleTurn,
} from '../../src/main/services/openAiCompatibleRunner';
import { AgentService } from '../../src/main/services/agent';
import { settingsService } from '../../src/main/services/settings';
import { keychain } from '../../src/main/keychain';
import { sessionService } from '../../src/main/services/session';

describe('Multi-Provider Support', () => {
  describe('Endpoint and Header Resolution', () => {
    it('resolves default endpoints correctly for each provider', () => {
      expect(resolveEndpoint('openai')).toBe('https://api.openai.com/v1/chat/completions');
      expect(resolveEndpoint('gemini')).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
      expect(resolveEndpoint('openrouter')).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(resolveEndpoint('ollama')).toBe('http://localhost:11434/v1/chat/completions');
    });

    it('respects custom baseUrl override', () => {
      expect(resolveEndpoint('ollama', 'http://192.168.1.100:11434/v1')).toBe(
        'http://192.168.1.100:11434/v1/chat/completions'
      );
      expect(resolveEndpoint('custom', 'https://my-proxy.internal/v1/chat/completions')).toBe(
        'https://my-proxy.internal/v1/chat/completions'
      );
    });

    it('constructs authorization headers with provider-specific metadata', () => {
      const openAiHeaders = resolveAuthHeaders('openai', 'sk-test-key');
      expect(openAiHeaders['Authorization']).toBe('Bearer sk-test-key');

      const openRouterHeaders = resolveAuthHeaders('openrouter', 'sk-or-test');
      expect(openRouterHeaders['Authorization']).toBe('Bearer sk-or-test');
      expect(openRouterHeaders['HTTP-Referer']).toBe('https://github.com/itsmahiii/rea-studio');
      expect(openRouterHeaders['X-Title']).toBe('REA Studio');
    });
  });

  describe('runOpenAiCompatibleTurn SSE Execution', () => {
    function createMockSseResponse(chunks: string[]): Response {
      const encoder = new TextEncoder();
      let index = 0;

      const readableStream = new ReadableStream({
        pull(controller) {
          if (index < chunks.length) {
            controller.enqueue(encoder.encode(chunks[index]));
            index++;
          } else {
            controller.close();
          }
        },
      });

      return new Response(readableStream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    it('handles streaming text delta without tools', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Analyzing"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" binary..."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const deltas: string[] = [];
      const mockFetch = vi.fn().mockResolvedValue(createMockSseResponse(chunks));

      const result = await runOpenAiCompatibleTurn({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4o',
        systemPrompt: 'You are REA.',
        history: [],
        prompt: 'Inspect binary',
        tools: [],
        fetchFn: mockFetch as unknown as typeof fetch,
        onDelta: (d) => deltas.push(d),
        onToolCallStart: vi.fn(),
        onToolCallResult: vi.fn(),
        onToolCallError: vi.fn(),
        checkPermission: vi.fn().mockResolvedValue(true),
        executeTool: vi.fn().mockResolvedValue({}),
      });

      expect(deltas.join('')).toBe('Analyzing binary...');
      expect(result).toBe('Analyzing binary...');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('handles tool call emission, permission check, and tool result feedback', async () => {
      // Turn 1: model calls tool binary_session
      const turn1Chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"binary_session","arguments":"{\\"verbose\\":true}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      // Turn 2: model outputs final text based on tool result
      const turn2Chunks = [
        'data: {"choices":[{"delta":{"content":"Session is active."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          createMockSseResponse(callCount === 1 ? turn1Chunks : turn2Chunks)
        );
      });

      const onToolCallStart = vi.fn();
      const onToolCallResult = vi.fn();
      const checkPermission = vi.fn().mockResolvedValue(true);
      const executeTool = vi.fn().mockResolvedValue({ status: 'ok', active: true });
      const deltas: string[] = [];

      const result = await runOpenAiCompatibleTurn({
        provider: 'gemini',
        apiKey: 'test-key',
        model: 'gemini-2.5-flash',
        systemPrompt: 'System',
        history: [],
        prompt: 'Check session',
        tools: [{ name: 'binary_session', description: 'Checks session' }],
        fetchFn: mockFetch as unknown as typeof fetch,
        onDelta: (d) => deltas.push(d),
        onToolCallStart,
        onToolCallResult,
        onToolCallError: vi.fn(),
        checkPermission,
        executeTool,
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(checkPermission).toHaveBeenCalledWith('binary_session', { verbose: true });
      expect(executeTool).toHaveBeenCalledWith('binary_session', { verbose: true });
      expect(onToolCallStart).toHaveBeenCalledWith('call_123', 'binary_session', { verbose: true });
      expect(onToolCallResult).toHaveBeenCalledWith(
        'call_123',
        'binary_session',
        { verbose: true },
        { status: 'ok', active: true }
      );
      expect(result).toBe('Session is active.');
    });

    it('denies execution when checkPermission returns false', async () => {
      const turn1Chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_risky","function":{"name":"execute_rizin_command","arguments":"{\\"cmd\\":\\"pdf\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ];
      const turn2Chunks = [
        'data: {"choices":[{"delta":{"content":"Understood, skipped command."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          createMockSseResponse(callCount === 1 ? turn1Chunks : turn2Chunks)
        );
      });

      const onToolCallError = vi.fn();
      const checkPermission = vi.fn().mockResolvedValue(false); // Denied by user
      const executeTool = vi.fn();

      await runOpenAiCompatibleTurn({
        provider: 'openrouter',
        apiKey: 'test-key',
        model: 'anthropic/claude-3.7-sonnet',
        systemPrompt: 'System',
        history: [],
        prompt: 'Disassemble function',
        tools: [{ name: 'execute_rizin_command' }],
        fetchFn: mockFetch as unknown as typeof fetch,
        onDelta: vi.fn(),
        onToolCallStart: vi.fn(),
        onToolCallResult: vi.fn(),
        onToolCallError,
        checkPermission,
        executeTool,
      });

      expect(checkPermission).toHaveBeenCalledWith('execute_rizin_command', { cmd: 'pdf' });
      expect(executeTool).not.toHaveBeenCalled();
      expect(onToolCallError).toHaveBeenCalledWith(
        'call_risky',
        'execute_rizin_command',
        { cmd: 'pdf' },
        'Tool execution denied by user policy.'
      );
    });
  });

  describe('AgentService Multi-Provider Dispatch', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('dispatches to openAiRunner when modelProvider is not anthropic', async () => {
      const mockOpenAiRunner = vi.fn().mockResolvedValue('Analysis complete.');

      const service = new AgentService({
        openAiRunner: mockOpenAiRunner,
      });

      vi.spyOn(settingsService, 'getSettings').mockReturnValue({
        hasAcceptedLegal: true,
        hasCompletedOnboarding: true,
        modelProvider: 'openai',
        selectedModel: 'gpt-4o',
        customModel: '',
        nativeProvider: 'auto',
        reaCommandOverride: '',
        envOverrides: {},
        analysisTimeoutSeconds: 120,
        theme: 'dark',
      });

      vi.spyOn(keychain, 'getApiKey').mockReturnValue('sk-mock-openai-key');
      vi.spyOn(service, 'ensureMcpClient').mockResolvedValue({
        listTools: vi.fn().mockResolvedValue({ tools: [] }),
        callTool: vi.fn().mockResolvedValue({ content: [] }),
      } as any);

      const sessionId = await service.startSession({
        path: 'C:/sample/target.exe',
        name: 'target.exe',
        targetType: 'PE',
      });

      await service.sendMessage('Analyze headers');

      expect(mockOpenAiRunner).toHaveBeenCalled();
      const callArgs = mockOpenAiRunner.mock.calls[0][0];
      expect(callArgs.provider).toBe('openai');
      expect(callArgs.model).toBe('gpt-4o');
      expect(callArgs.apiKey).toBe('sk-mock-openai-key');
    });
  });
});
