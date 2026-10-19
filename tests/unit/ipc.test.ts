import { describe, it, expect } from 'vitest';
import {
  ValidateTargetRequestSchema,
  SessionMetadataSchema,
  ApprovalRequestSchema,
  makeSuccess,
  makeError,
  ToolCallSchema,
} from '@/shared/ipc';

describe('Shared IPC Schemas & Contracts', () => {
  it('validates target request correctly', () => {
    const valid = { path: 'C:/app/target.asar' };
    const parsed = ValidateTargetRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);

    const invalid = { invalidField: 123 };
    const failed = ValidateTargetRequestSchema.safeParse(invalid);
    expect(failed.success).toBe(false);
  });

  it('validates session metadata schema', () => {
    const meta = {
      id: 'sess-123',
      title: 'Analysis',
      targetPath: 'C:/target.exe',
      targetName: 'target.exe',
      targetType: 'pe_binary',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 5,
    };
    const parsed = SessionMetadataSchema.safeParse(meta);
    expect(parsed.success).toBe(true);
  });

  it('validates approval request schema', () => {
    const approval = {
      approvalId: 'appr-1',
      sessionId: 'sess-1',
      toolName: 'capture_process_scenario',
      params: { command: 'node main.js' },
      reason: 'Requires execution',
      requestedAt: new Date().toISOString(),
    };
    const parsed = ApprovalRequestSchema.safeParse(approval);
    expect(parsed.success).toBe(true);
  });

  it('validates tool call statuses', () => {
    const toolCall = {
      id: 'tc-1',
      toolName: 'analyze_javascript_application',
      input: { path: '/tmp/app.asar' },
      status: 'running' as const,
      isRisky: false,
      startedAt: new Date().toISOString(),
    };
    expect(ToolCallSchema.safeParse(toolCall).success).toBe(true);

    const invalidStatus = { ...toolCall, status: 'unknown_status' };
    expect(ToolCallSchema.safeParse(invalidStatus).success).toBe(false);
  });

  it('constructs standard discriminated union results', () => {
    const okResult = makeSuccess({ count: 42 });
    expect(okResult.ok).toBe(true);
    if (okResult.ok) {
      expect(okResult.data.count).toBe(42);
    }

    const errResult = makeError('Unauthorized');
    expect(errResult.ok).toBe(false);
    if (!errResult.ok) {
      expect(errResult.error).toBe('Unauthorized');
    }
  });
});
