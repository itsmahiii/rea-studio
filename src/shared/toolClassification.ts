/**
 * Classification and presentation helpers for REA MCP tools.
 * Safe to import in both Main and Renderer processes.
 */

export const RISKY_REA_TOOLS = new Set<string>([
  // Process execution
  'capture_process_scenario',

  // Browser / Electron runtime
  'capture_browser_scenario',
  'capture_electron_scenario',
  'capture_web_screenshot',
  'observe_web_execution',
  'observe_web_session',
  'observe_javascript_runtime',
  'list_browser_targets',
  'list_electron_targets',
  'list_javascript_runtime_targets',
  'inspect_electron_page',
  'inspect_web_page',
  'inspect_web_event_listeners',
  'discover_webmcp_tools',
  'export_web_scripts',

  // Native UI observation & action
  'capture_native_ui_scenario',
  'observe_native_calls',
  'observe_native_ui',
  'trace_native_ui_action',

  // Frida code injection
  'start_frida_session',
  'load_frida_script',
  'resume_frida_session',
  'unload_frida_script',
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
  'pull_adb_file',
  'pull_adb_package',
  'read_adb_setting',
]);

export function cleanToolName(toolName: string): string {
  if (!toolName) return '';
  return toolName.replace(/^mcp__[a-zA-Z0-9_-]+__/, '');
}

export function isRiskyTool(toolName: string): boolean {
  return RISKY_REA_TOOLS.has(cleanToolName(toolName));
}

const ACRONYMS: Record<string, string> = {
  adb: 'ADB',
  ui: 'UI',
  api: 'API',
  pe: 'PE',
  wasm: 'WASM',
  evm: 'EVM',
  macho: 'Mach-O',
  jeb: 'JEB',
  gdb: 'GDB',
  aot: 'AOT',
  pcap: 'PCAP',
  apk: 'APK',
  apktool: 'Apktool',
};

export function getToolFriendlyName(toolName: string): string {
  const cleaned = cleanToolName(toolName);
  if (!cleaned) return 'Tool Call';

  return cleaned
    .split('_')
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) {
        return ACRONYMS[lower];
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function getToolBadgeClassification(
  toolName: string,
  explicitRisky?: boolean,
): 'Static' | 'Runs target' {
  if (explicitRisky !== undefined) {
    return explicitRisky ? 'Runs target' : 'Static';
  }
  return isRiskyTool(toolName) ? 'Runs target' : 'Static';
}
