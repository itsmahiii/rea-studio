import { describe, it, expect } from 'vitest';
import { ApprovalGate, RISKY_REA_TOOLS } from '@/main/services/approval';

describe('ApprovalGate', () => {
  it('correctly categorizes risky REA tools according to REA_FACTS.md §4.2', () => {
    const gate = new ApprovalGate();

    // Risky tools MUST return true
    expect(gate.isRisky('capture_process_scenario')).toBe(true);
    expect(gate.isRisky('capture_browser_scenario')).toBe(true);
    expect(gate.isRisky('start_frida_session')).toBe(true);
    expect(gate.isRisky('start_gdb_session')).toBe(true);
    expect(gate.isRisky('start_adb_app')).toBe(true);
    expect(gate.isRisky('push_adb_file')).toBe(true);

    // Safe static tools MUST return false
    expect(gate.isRisky('binary_session')).toBe(false);
    expect(gate.isRisky('analyze_javascript_application')).toBe(false);
    expect(gate.isRisky('inspect_artifact')).toBe(false);
    expect(gate.isRisky('inspect_pe_resources')).toBe(false);
    expect(gate.isRisky('read_bytes')).toBe(false);
  });

  it('pauses and awaits explicit user resolution', async () => {
    const gate = new ApprovalGate();
    const { request, promise } = gate.createRequest(
      'sess-test',
      'capture_process_scenario',
      { command: 'run.exe' },
      'User verification required'
    );

    expect(request.approvalId).toBeDefined();
    expect(request.toolName).toBe('capture_process_scenario');

    // Simulate approval resolution in background
    setTimeout(() => {
      gate.resolve(request.approvalId, true);
    }, 10);

    const approved = await promise;
    expect(approved).toBe(true);
  });

  it('handles denial correctly', async () => {
    const gate = new ApprovalGate();
    const { request, promise } = gate.createRequest(
      'sess-test',
      'start_frida_session',
      { pid: 1234 }
    );

    setTimeout(() => {
      gate.resolve(request.approvalId, false);
    }, 10);

    const approved = await promise;
    expect(approved).toBe(false);
  });
});
