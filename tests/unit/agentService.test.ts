import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentService } from '@/main/services/agent';
import type { Query, SDKMessage, Options } from '@anthropic-ai/claude-agent-sdk';
import type { AgentEvent } from '@/shared/events';
import { keychain } from '@/main/keychain';

function createMockQuery(messages: SDKMessage[], onClose?: () => void): Query {
  async function* gen() {
    for (const msg of messages) {
      yield msg;
    }
  }
  const q = gen() as unknown as Query;
  q.close = onClose || (() => {});
  q.interrupt = async () => undefined;
  return q;
}

describe('AgentService with Fake SDK Stream', () => {
  beforeEach(() => {
    // Mock keychain to have an active key
    vi.spyOn(keychain, 'getApiKey').mockReturnValue('sk-ant-test-key-123');
  });

  it('handles normal run: streams tokens, tool calls, results, and finish', async () => {
    const events: AgentEvent[] = [];

    const mockMessages: SDKMessage[] = [
      // 1. Stream event delta
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'text_delta',
            text: 'Analyzing target artifact...',
          },
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-0000-0000-000000000001' as any,
        session_id: 'test-session',
      } as any,
      // 2. Assistant tool use
      {
        type: 'assistant',
        uuid: '00000000-0000-0000-0000-000000000002' as any,
        session_id: 'test-session',
        parent_tool_use_id: null,
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-7-sonnet',
          content: [
            {
              type: 'tool_use',
              id: 'call-1',
              name: 'mcp__rea__inspect_artifact',
              input: { path: '/tmp/target.exe' },
            },
          ],
          stop_reason: null,
          usage: { input_tokens: 10, output_tokens: 20 },
        },
      } as any,
      // 3. Tool result
      {
        type: 'user',
        uuid: '00000000-0000-0000-0000-000000000003' as any,
        session_id: 'test-session',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call-1',
              content: { format: 'PE32+', arch: 'x86_64' },
            },
          ],
        },
      } as any,
      // 4. Result success
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 500,
        duration_api_ms: 400,
        num_turns: 1,
        result: 'Analysis complete: PE32+ x86_64 binary.',
        stop_reason: 'end_turn',
        total_cost_usd: 0.001,
        usage: {} as any,
        modelUsage: {},
        permission_denials: [],
      } as any,
    ];

    const service = new AgentService({
      queryRunner: () => createMockQuery(mockMessages),
    });

    service.onEvent((evt) => events.push(evt));

    await service.startSession({
      path: 'C:/sample/target.exe',
      name: 'target.exe',
      targetType: 'pe_binary',
    });

    await service.sendMessage('Inspect the target headers');

    expect(events.some((e) => e.type === 'assistant_text_delta' && e.textDelta.includes('Analyzing'))).toBe(true);
    expect(events.some((e) => e.type === 'tool_call_started' && e.toolName === 'inspect_artifact')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call_result' && e.toolCallId === 'call-1')).toBe(true);
    expect(events.some((e) => e.type === 'run_finished')).toBe(true);
  });

  it('handles tool error correctly', async () => {
    const events: AgentEvent[] = [];

    const mockMessages: SDKMessage[] = [
      {
        type: 'assistant',
        uuid: '00000000-0000-0000-0000-000000000002' as any,
        session_id: 'test-session',
        parent_tool_use_id: null,
        message: {
          id: 'msg-1',
          type: 'message',
          role: 'assistant',
          model: 'claude-3-7-sonnet',
          content: [
            {
              type: 'tool_use',
              id: 'call-err',
              name: 'mcp__rea__binary_overview',
              input: {},
            },
          ],
          stop_reason: null,
          usage: {} as any,
        },
      } as any,
      {
        type: 'user',
        uuid: '00000000-0000-0000-0000-000000000003' as any,
        session_id: 'test-session',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call-err',
              content: 'Failed to parse binary format',
              is_error: true,
            },
          ],
        },
      } as any,
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 100,
        duration_api_ms: 80,
        num_turns: 1,
        result: 'Encountered error in tool.',
        stop_reason: 'end_turn',
        total_cost_usd: 0.001,
        usage: {} as any,
        modelUsage: {},
        permission_denials: [],
      } as any,
    ];

    const service = new AgentService({
      queryRunner: () => createMockQuery(mockMessages),
    });

    service.onEvent((evt) => events.push(evt));

    await service.startSession({
      path: 'C:/sample/corrupted.bin',
      name: 'corrupted.bin',
      targetType: 'raw_binary',
    });

    await service.sendMessage('Get binary overview');

    const errEvent = events.find((e) => e.type === 'tool_call_error');
    expect(errEvent).toBeDefined();
    if (errEvent && errEvent.type === 'tool_call_error') {
      expect(errEvent.error).toContain('Failed to parse binary format');
    }
  });

  it('permission flow: prompts on risky tools and respects allow', async () => {
    const events: AgentEvent[] = [];
    let capturedCanUseTool: any;

    const mockMessages: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 100,
        duration_api_ms: 80,
        num_turns: 1,
        result: 'Executed with permission.',
        stop_reason: 'end_turn',
        total_cost_usd: 0.001,
        usage: {} as any,
        modelUsage: {},
        permission_denials: [],
      } as any,
    ];

    const service = new AgentService({
      queryRunner: ({ options }) => {
        capturedCanUseTool = options?.canUseTool;
        return createMockQuery(mockMessages);
      },
    });

    service.onEvent((evt) => events.push(evt));

    await service.startSession({
      path: 'C:/sample/app.exe',
      name: 'app.exe',
      targetType: 'pe_binary',
    });

    // Start send message
    const sendPromise = service.sendMessage('Run target scenario');

    // Wait until query has initialized canUseTool
    await new Promise((r) => setTimeout(r, 10));

    // Simulate SDK invoking canUseTool with risky tool
    const permissionPromise = capturedCanUseTool(
      'capture_process_scenario',
      { command: 'app.exe --test' },
      { title: 'Execute target under PTY' }
    );

    // Permission request should be emitted
    await new Promise((r) => setTimeout(r, 10));
    const reqEvent = events.find((e) => e.type === 'permission_request');
    expect(reqEvent).toBeDefined();

    if (reqEvent && reqEvent.type === 'permission_request') {
      expect(reqEvent.toolName).toBe('capture_process_scenario');
      // Respond allow
      service.respondPermission(reqEvent.approvalId, true);
    }

    const decision = await permissionPromise;
    expect(decision).toEqual({ behavior: 'allow' });

    await sendPromise;
  });

  it('permission flow: prompts on risky tools and respects deny', async () => {
    const events: AgentEvent[] = [];
    let capturedCanUseTool: any;

    const service = new AgentService({
      queryRunner: ({ options }) => {
        capturedCanUseTool = options?.canUseTool;
        return createMockQuery([]);
      },
    });

    service.onEvent((evt) => events.push(evt));

    await service.startSession({
      path: 'C:/sample/app.exe',
      name: 'app.exe',
      targetType: 'pe_binary',
    });

    const sendPromise = service.sendMessage('Inject with frida');
    await new Promise((r) => setTimeout(r, 10));

    const permissionPromise = capturedCanUseTool(
      'start_frida_session',
      { pid: 4000 },
      { title: 'Inject Frida into process' }
    );

    await new Promise((r) => setTimeout(r, 10));
    const reqEvent = events.find((e) => e.type === 'permission_request');
    expect(reqEvent).toBeDefined();

    if (reqEvent && reqEvent.type === 'permission_request') {
      service.respondPermission(reqEvent.approvalId, false);
    }

    const decision = await permissionPromise;
    expect(decision.behavior).toBe('deny');
    expect(decision.message).toContain('Permission denied by user');

    await sendPromise;
  });

  it('handles cancel: calls close on query and emits run_error', async () => {
    const events: AgentEvent[] = [];
    let closed = false;

    // A hanging query generator
    async function* slowGen() {
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Working...' },
        },
        parent_tool_use_id: null,
        uuid: '00000000-0000-0000-0000-000000000001' as any,
        session_id: 'test-session',
      } as any;
      await new Promise((r) => setTimeout(r, 2000));
    }

    const mockQuery = slowGen() as unknown as Query;
    mockQuery.close = () => {
      closed = true;
    };
    mockQuery.interrupt = async () => undefined;

    const service = new AgentService({
      queryRunner: () => mockQuery,
    });

    service.onEvent((evt) => events.push(evt));

    await service.startSession({
      path: 'C:/sample/app.exe',
      name: 'app.exe',
      targetType: 'pe_binary',
    });

    const sendPromise = service.sendMessage('Start analysis');
    await new Promise((r) => setTimeout(r, 10));

    service.cancel();
    expect(closed).toBe(true);

    const cancelEvent = events.find((e) => e.type === 'run_error' && e.error.includes('cancelled'));
    expect(cancelEvent).toBeDefined();

    await sendPromise;
  });

  it('handles crash with auto-restart retry', async () => {
    let callCount = 0;
    const events: AgentEvent[] = [];

    const mockSuccessMessages: SDKMessage[] = [
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        duration_ms: 100,
        duration_api_ms: 80,
        num_turns: 1,
        result: 'Success after restart.',
        stop_reason: 'end_turn',
        total_cost_usd: 0.001,
        usage: {} as any,
        modelUsage: {},
        permission_denials: [],
      } as any,
    ];

    const service = new AgentService({
      queryRunner: () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('MCP server crashed unexpectedly (ECONNRESET)');
        }
        return createMockQuery(mockSuccessMessages);
      },
    });

    service.onEvent((evt) => events.push(evt));

    await service.startSession({
      path: 'C:/sample/app.exe',
      name: 'app.exe',
      targetType: 'pe_binary',
    });

    await service.sendMessage('Analyze headers');

    // Should have retried and completed
    expect(callCount).toBe(2);
    expect(events.some((e) => e.type === 'run_finished')).toBe(true);
  });
});
