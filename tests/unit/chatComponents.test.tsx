// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToolCallCard } from '../../src/renderer/components/Chat/ToolCallCard';
import { PermissionCard } from '../../src/renderer/components/Chat/PermissionCard';
import type { ToolCall, ApprovalRequest } from '../../src/shared/ipc';

describe('Chat Components: ToolCallCard', () => {
  it('renders static tool call card with friendly name, static badge, and done status', () => {
    const toolCall: ToolCall = {
      id: 'tc-1',
      toolName: 'analyze_javascript_application',
      input: { entryPoint: 'index.js' },
      output: { framework: 'Electron', packages: ['react', 'zod'] },
      status: 'success',
      isRisky: false,
      startedAt: '2026-10-18T10:00:00.000Z',
      completedAt: '2026-10-18T10:00:00.125Z',
    };

    render(<ToolCallCard toolCall={toolCall} />);

    // Friendly name should be formatted
    expect(screen.getByText('Analyze Javascript Application')).toBeDefined();
    // Static badge should be rendered
    expect(screen.getByTestId('badge-static')).toBeDefined();
    expect(screen.getByText('Static')).toBeDefined();
    // Done status badge
    expect(screen.getByTestId('tool-status-done')).toBeDefined();
    // Timing should show ~125ms
    expect(screen.getByText('125ms')).toBeDefined();
  });

  it('renders risky tool call with "Runs target" badge and running status', () => {
    const toolCall: ToolCall = {
      id: 'tc-2',
      toolName: 'capture_process_scenario',
      input: { pid: 1234, durationSec: 5 },
      status: 'running',
      isRisky: true,
      startedAt: new Date().toISOString(),
    };

    render(<ToolCallCard toolCall={toolCall} />);

    expect(screen.getByText('Capture Process Scenario')).toBeDefined();
    expect(screen.getByTestId('badge-runs-target')).toBeDefined();
    expect(screen.getByText('Runs target')).toBeDefined();
    expect(screen.getByTestId('tool-status-running')).toBeDefined();
  });

  it('toggles expansion to show parameters and evidence', () => {
    const toolCall: ToolCall = {
      id: 'tc-3',
      toolName: 'inspect_electron_page',
      input: { targetUrl: 'http://localhost:3000' },
      output: { title: 'Main Window', loaded: true },
      status: 'success',
      isRisky: true,
      startedAt: '2026-10-18T10:00:00.000Z',
      completedAt: '2026-10-18T10:00:01.000Z',
    };

    render(<ToolCallCard toolCall={toolCall} />);

    // Initially collapsed
    expect(screen.queryByText('Input Parameters')).toBeNull();

    // Click header to expand
    const headerBtn = screen.getByRole('button');
    fireEvent.click(headerBtn);

    expect(screen.getByText('Input Parameters')).toBeDefined();
    expect(screen.getByText('Evidence / Output')).toBeDefined();
    expect(screen.getByText(/"targetUrl": "http:\/\/localhost:3000"/)).toBeDefined();
  });

  it('displays raw error message when tool call fails', () => {
    const toolCall: ToolCall = {
      id: 'tc-4',
      toolName: 'start_frida_session',
      input: { processName: 'target.exe' },
      error: 'Failed to attach: process target.exe not found or permission denied',
      status: 'error',
      isRisky: true,
      startedAt: '2026-10-18T10:00:00.000Z',
      completedAt: '2026-10-18T10:00:00.500Z',
    };

    render(<ToolCallCard toolCall={toolCall} initiallyExpanded={true} />);

    expect(screen.getByTestId('tool-status-error')).toBeDefined();
    expect(screen.getByTestId('tool-error-message')).toBeDefined();
    expect(
      screen.getByText(/process target.exe not found or permission denied/),
    ).toBeDefined();
  });
});

describe('Chat Components: PermissionCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders exact action description, friendly tool name, and params', () => {
    const request: ApprovalRequest = {
      approvalId: 'appr-123',
      sessionId: 'sess-abc',
      toolName: 'capture_process_scenario',
      params: { pid: 4567, filter: 'network' },
      reason: 'Agent wants to attach a tracer to the running target process to capture network activity.',
      requestedAt: new Date().toISOString(),
    };

    const onRespond = vi.fn();
    render(<PermissionCard request={request} onRespond={onRespond} />);

    expect(
      screen.getByText(
        'Agent wants to attach a tracer to the running target process to capture network activity.',
      ),
    ).toBeDefined();
    expect(screen.getByText('Capture Process Scenario')).toBeDefined();
    expect(screen.getByText(/"pid": 4567/)).toBeDefined();
    expect(screen.getByTestId('countdown-timer')).toBeDefined();
    expect(screen.getByText('60s')).toBeDefined();
  });

  it('triggers onRespond with true when "Allow once" is clicked', () => {
    const request: ApprovalRequest = {
      approvalId: 'appr-456',
      sessionId: 'sess-abc',
      toolName: 'start_frida_session',
      params: { script: 'hook.js' },
      reason: 'Injecting instrumentation script into target process',
      requestedAt: new Date().toISOString(),
    };

    const onRespond = vi.fn();
    render(<PermissionCard request={request} onRespond={onRespond} />);

    const allowBtn = screen.getByTestId('permission-allow-btn');
    fireEvent.click(allowBtn);

    expect(onRespond).toHaveBeenCalledWith('appr-456', true);
  });

  it('triggers onRespond with false when "Deny" is clicked', () => {
    const request: ApprovalRequest = {
      approvalId: 'appr-789',
      sessionId: 'sess-abc',
      toolName: 'start_frida_session',
      params: { script: 'hook.js' },
      reason: 'Injecting instrumentation script into target process',
      requestedAt: new Date().toISOString(),
    };

    const onRespond = vi.fn();
    render(<PermissionCard request={request} onRespond={onRespond} />);

    const denyBtn = screen.getByTestId('permission-deny-btn');
    fireEvent.click(denyBtn);

    expect(onRespond).toHaveBeenCalledWith('appr-789', false);
  });

  it('counts down and auto-denies when timer reaches zero', () => {
    const request: ApprovalRequest = {
      approvalId: 'appr-timeout',
      sessionId: 'sess-abc',
      toolName: 'capture_electron_scenario',
      params: {},
      reason: 'Observe electron page runtime',
      requestedAt: new Date().toISOString(),
    };

    const onRespond = vi.fn();
    render(
      <PermissionCard
        request={request}
        onRespond={onRespond}
        initialSeconds={3}
      />,
    );

    expect(screen.getByText('3s')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('2s')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onRespond).toHaveBeenCalledWith('appr-timeout', false);
  });
});
