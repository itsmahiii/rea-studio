import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApprovalGate, RISKY_REA_TOOLS } from '../../src/main/services/approval';
import { AgentService } from '../../src/main/services/agent';
import { isRiskyTool, cleanToolName } from '../../src/shared/toolClassification';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';

describe('Permission Gate & Flow Security Verification', () => {
  let gate: ApprovalGate;

  beforeEach(() => {
    vi.useFakeTimers();
    gate = new ApprovalGate();
  });

  afterEach(() => {
    gate.clear();
    vi.useRealTimers();
  });

  describe('Tool Risk Classification', () => {
    it('classifies all process/device/runtime execution tools as risky', () => {
      const riskySamples = [
        'capture_process_scenario',
        'capture_browser_scenario',
        'capture_electron_scenario',
        'observe_web_execution',
        'observe_web_session',
        'observe_javascript_runtime',
        'capture_native_ui_scenario',
        'observe_native_calls',
        'observe_native_ui',
        'trace_native_ui_action',
        'start_frida_session',
        'load_frida_script',
        'resume_frida_session',
        'instrument_with_frida',
        'start_gdb_session',
        'gdb_console',
        'start_rizin_debug_session',
        'rizin_debug_command',
        'execute_rizin_command',
        'cutter_command',
        'install_adb_package',
        'uninstall_adb_package',
        'start_adb_app',
        'start_adb_activity',
        'stop_adb_app',
        'push_adb_file',
      ];

      for (const tool of riskySamples) {
        expect(gate.isRisky(tool)).toBe(true);
        expect(isRiskyTool(tool)).toBe(true);
      }
    });

    it('classifies passive analysis and inspection tools as safe/static', () => {
      const safeSamples = [
        'binary_session',
        'inspect_artifact',
        'inspect_pe_resources',
        'read_bytes',
        'analyze_javascript_application',
        'demangle_swift',
        'inspect_wasm_artifact',
        'inspect_sqlite_database',
        'inspect_go_binary',
        'inspect_rust_binary',
      ];

      for (const tool of safeSamples) {
        expect(gate.isRisky(tool)).toBe(false);
        expect(isRiskyTool(tool)).toBe(false);
      }
    });
  });

  describe('ApprovalGate Execution Flow', () => {
    it('proves a "Runs target" tool cannot execute without explicit allow', async () => {
      const { request, promise } = gate.createRequest(
        'sess-100',
        'capture_process_scenario',
        { command: 'malicious.exe' },
        'Executes target process'
      );

      let resolved = false;
      let result: boolean | null = null;
      promise.then((res) => {
        resolved = true;
        result = res;
      });

      // Must remain pending and not execute
      await vi.advanceTimersByTimeAsync(1000);
      expect(resolved).toBe(false);
      expect(result).toBeNull();

      // Only when explicitly allowed does it resolve true
      gate.resolve(request.approvalId, true);
      await promise;
      expect(resolved).toBe(true);
      expect(result).toBe(true);
    });

    it('enforces deny-by-default on timeout', async () => {
      const timeoutMs = 5000;
      const { promise } = gate.createRequest(
        'sess-101',
        'start_gdb_session',
        { pid: 9999 },
        'Attach native debugger',
        timeoutMs
      );

      let result: boolean | null = null;
      promise.then((res) => {
        result = res;
      });

      // Advance clock past the timeout window
      await vi.advanceTimersByTimeAsync(timeoutMs + 100);

      const finalResult = await promise;
      expect(finalResult).toBe(false);
      expect(result).toBe(false);
    });

    it('denies execution immediately if user declines', async () => {
      const { request, promise } = gate.createRequest(
        'sess-102',
        'install_adb_package',
        { package: 'untrusted.apk' }
      );

      gate.resolve(request.approvalId, false);
      const approved = await promise;
      expect(approved).toBe(false);
    });

    it('denies all pending approvals on clear/cancellation', async () => {
      const req1 = gate.createRequest('sess-103', 'capture_process_scenario', {});
      const req2 = gate.createRequest('sess-103', 'start_frida_session', {});

      gate.clear();

      const [res1, res2] = await Promise.all([req1.promise, req2.promise]);
      expect(res1).toBe(false);
      expect(res2).toBe(false);
    });
  });

  describe('AgentService Permission Integration', () => {
    it('auto-approves static tools and pauses on risky tools with deny-on-timeout', async () => {
      const mockQueryRunner = vi.fn();
      const agentService = new AgentService({
        queryRunner: mockQueryRunner,
        approvalTimeoutMs: 2000,
      });

      let permissionEvent: any = null;
      agentService.onEvent((event) => {
        if (event.type === 'permission_request') {
          permissionEvent = event;
        }
      });

      // Access private handleToolPermission for testing
      const handleToolPermission = (agentService as any).handleToolPermission.bind(agentService);

      // 1. Safe tool should auto-allow immediately
      const safeResult: PermissionResult = await handleToolPermission(
        'sess-200',
        'read_bytes',
        { address: '0x1000' },
        {}
      );
      expect(safeResult.behavior).toBe('allow');
      expect(permissionEvent).toBeNull();

      // 2. Risky tool should emit permission_request and pause
      const riskyPromise: Promise<PermissionResult> = handleToolPermission(
        'sess-200',
        'capture_process_scenario',
        { command: 'exploit.exe' },
        { title: 'Dangerous Process Execution' }
      );

      expect(permissionEvent).not.toBeNull();
      expect(permissionEvent.toolName).toBe('capture_process_scenario');
      expect(permissionEvent.description).toBe('Dangerous Process Execution');

      // 3. User approves
      const approvalId = permissionEvent.approvalId;
      agentService.respondPermission(approvalId, true);

      const approvedResult = await riskyPromise;
      expect(approvedResult.behavior).toBe('allow');

      // 4. Test deny-by-default on timeout in AgentService
      permissionEvent = null;
      const timeoutPromise: Promise<PermissionResult> = handleToolPermission(
        'sess-200',
        'start_frida_session',
        { target: 'process' },
        {}
      );

      expect(permissionEvent).not.toBeNull();

      // Advance timer past approval timeout
      await vi.advanceTimersByTimeAsync(2500);

      const timeoutResult = await timeoutPromise;
      expect(timeoutResult.behavior).toBe('deny');
      expect((timeoutResult as any).message).toContain('timed out');
    });
  });
});
