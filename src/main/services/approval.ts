import * as crypto from 'crypto';
import type { ApprovalRequest } from '../../shared/ipc';

/**
 * Risky REA tools that execute the target or connect to running processes / devices.
 * Ground truth: docs/REA_FACTS.md §4.2.
 * Any tool in this list MUST be explicitly approved by the user before invocation.
 */
export const RISKY_REA_TOOLS = new Set([
  // Process execution (Primary execute-target tool)
  'capture_process_scenario',

  // Browser / Electron runtime
  'capture_browser_scenario',
  'capture_electron_scenario',
  'observe_web_execution',
  'observe_web_session',
  'observe_javascript_runtime',

  // Native UI observation & action
  'capture_native_ui_scenario',
  'observe_native_calls',
  'observe_native_ui',
  'trace_native_ui_action',

  // Frida code injection
  'start_frida_session',
  'load_frida_script',
  'resume_frida_session',
  'instrument_with_frida',

  // Debugger attachment / commands
  'start_gdb_session',
  'gdb_console',
  'start_rizin_debug_session',
  'rizin_debug_command',
  'execute_rizin_command',
  'cutter_command',

  // ADB device control / app installation & launch
  'install_adb_package',
  'uninstall_adb_package',
  'start_adb_app',
  'start_adb_activity',
  'stop_adb_app',
  'push_adb_file',
]);

export interface PendingApproval {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
  timer?: NodeJS.Timeout;
}

export class ApprovalGate {
  private pendingApprovals = new Map<string, PendingApproval>();
  private defaultTimeoutMs = 60_000;

  public isRisky(toolName: string): boolean {
    return RISKY_REA_TOOLS.has(toolName);
  }

  public createRequest(
    sessionId: string,
    toolName: string,
    params: Record<string, unknown>,
    reason?: string,
    timeoutMs?: number
  ): { request: ApprovalRequest; promise: Promise<boolean> } {
    const approvalId = crypto.randomUUID();
    const timeout = timeoutMs ?? this.defaultTimeoutMs;
    const request: ApprovalRequest = {
      approvalId,
      sessionId,
      toolName,
      params,
      reason:
        reason ||
        `This action requires executing code or attaching to a process (${toolName}). User confirmation required.`,
      requestedAt: new Date().toISOString(),
    };

    let resolvePromise!: (approved: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });

    const timer = setTimeout(() => {
      if (this.pendingApprovals.has(approvalId)) {
        this.pendingApprovals.delete(approvalId);
        resolvePromise(false); // Deny by default on timeout
      }
    }, timeout);

    this.pendingApprovals.set(approvalId, {
      request,
      resolve: resolvePromise,
      timer,
    });

    return { request, promise };
  }

  public resolve(approvalId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      return false;
    }
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    this.pendingApprovals.delete(approvalId);
    pending.resolve(approved);
    return true;
  }

  public getPending(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  public clear(): void {
    for (const [, pending] of this.pendingApprovals) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pending.resolve(false);
    }
    this.pendingApprovals.clear();
  }
}

export const approvalGate = new ApprovalGate();
