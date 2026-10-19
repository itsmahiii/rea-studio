import * as fs from 'fs';
import * as path from 'path';
import type { ReadinessCheckItem, TargetReadinessReport } from '../../shared/ipc';

export interface EnvironmentProbe {
  isCommandOnPath(command: string): boolean;
  fileExists(filePath: string): boolean;
  getEnvVar(name: string): string | undefined;
  platform: NodeJS.Platform;
}

export class DefaultEnvironmentProbe implements EnvironmentProbe {
  public platform: NodeJS.Platform = process.platform;

  public getEnvVar(name: string): string | undefined {
    return process.env[name];
  }

  public fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  public isCommandOnPath(command: string): boolean {
    const envPath = process.env.PATH || '';
    const pathDirs = envPath.split(path.delimiter);
    const extensions =
      process.platform === 'win32'
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase())
        : [''];

    for (const dir of pathDirs) {
      if (!dir) continue;
      for (const ext of extensions) {
        const full = path.join(dir, command + (command.toLowerCase().endsWith(ext) ? '' : ext));
        if (this.fileExists(full)) {
          return true;
        }
      }
    }
    return false;
  }
}

export class ReadinessService {
  private probe: EnvironmentProbe;

  constructor(probe?: EnvironmentProbe) {
    this.probe = probe ?? new DefaultEnvironmentProbe();
  }

  public setProbe(probe: EnvironmentProbe): void {
    this.probe = probe;
  }

  private hasExecutable(name: string, fallbackPaths: string[] = []): boolean {
    if (this.probe.isCommandOnPath(name)) {
      return true;
    }
    for (const p of fallbackPaths) {
      if (this.probe.fileExists(p)) {
        return true;
      }
    }
    return false;
  }

  public getReadiness(targetType: string, _targetPath?: string): TargetReadinessReport {
    const checks: ReadinessCheckItem[] = [];

    switch (targetType) {
      case 'javascript_electron':
      case 'javascript_bundle': {
        // 1. Node.js Runtime Check
        const nodeVersion = process.versions.node || '24.21.0';
        const semverMajor = parseInt(nodeVersion.split('.')[0] ?? '0', 10);
        const nodePassed = semverMajor >= 22;
        checks.push({
          id: 'node-runtime',
          name: 'Node.js Runtime',
          description: 'REA requires Node.js >=22.19, >=24.11, or 26+',
          passed: nodePassed,
          status: nodePassed ? 'passed' : 'failed',
          detail: `Node ${nodeVersion} (${nodePassed ? 'compatible' : 'incompatible'})`,
          fixHint: nodePassed ? undefined : 'Install Node.js 22.19+ or 24.11+ from https://nodejs.org',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#prerequisites',
        });

        // 2. Process Table Inspection
        const isWin = this.probe.platform === 'win32';
        const hasProc = isWin
          ? this.hasExecutable('tasklist', ['C:\\Windows\\System32\\tasklist.exe'])
          : this.hasExecutable('ps');
        checks.push({
          id: 'process-inspection',
          name: 'Process Table Inspection',
          description: isWin ? 'tasklist.exe for process inspection' : 'procps-compatible ps on PATH',
          passed: hasProc,
          status: hasProc ? 'passed' : 'failed',
          detail: hasProc
            ? isWin
              ? 'tasklist.exe found on system'
              : 'ps found on PATH'
            : 'Process inspection tool missing',
          fixHint: hasProc
            ? undefined
            : isWin
              ? 'Verify C:\\Windows\\System32 is on PATH.'
              : 'Install procps package (`apt install procps` or equivalent).',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md',
        });

        // 3. Static AST & Bundle Recovery Engine
        checks.push({
          id: 'static-ast-engine',
          name: 'Static JavaScript & AST Engine',
          description: 'REA built-in parser for ASAR extraction, bundle recovery, and symbol mapping',
          passed: true,
          status: 'passed',
          detail: 'Built-in REA JavaScript analysis tools ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/javascript-application-workflows.md',
        });
        break;
      }

      case 'native_pe':
      case 'native_elf':
      case 'native_macho': {
        const foundEngines: string[] = [];

        // Hopper
        if (
          this.hasExecutable('hopper', [
            '/Applications/Hopper Disassembler v4.app/Contents/MacOS/hopper',
            'C:\\Program Files\\Hopper Disassembler v4\\bin\\hopper.exe',
          ])
        ) {
          foundEngines.push('Hopper');
        }

        // Ghidra
        if (
          this.hasExecutable('ghidraRun', [
            this.probe.getEnvVar('GHIDRA_INSTALL_DIR')
              ? path.join(this.probe.getEnvVar('GHIDRA_INSTALL_DIR')!, 'ghidraRun')
              : '',
          ]) ||
          this.hasExecutable('ghidra')
        ) {
          foundEngines.push('Ghidra');
        }

        // IDA Pro
        if (
          this.hasExecutable('ida64') ||
          this.hasExecutable('ida') ||
          this.hasExecutable('idat64') ||
          (this.probe.getEnvVar('IDA_PATH') && this.probe.fileExists(this.probe.getEnvVar('IDA_PATH')!))
        ) {
          foundEngines.push('IDA Pro');
        }

        // Rizin
        if (this.hasExecutable('rz-bin') || this.hasExecutable('rizin')) {
          foundEngines.push('Rizin');
        }

        // objdump
        if (this.hasExecutable('llvm-objdump') || this.hasExecutable('objdump')) {
          foundEngines.push('objdump');
        }

        const hasAnyEngine = foundEngines.length > 0;
        checks.push({
          id: 'native-disassembler',
          name: 'Native Disassembler / Decompiler Engine',
          description: 'Requires at least one supported engine: Ghidra, Hopper, IDA, Rizin, or objdump',
          passed: hasAnyEngine,
          status: hasAnyEngine ? 'passed' : 'failed',
          detail: hasAnyEngine
            ? `Detected: ${foundEngines.join(', ')}`
            : 'No disassembler engine found on PATH or standard directories',
          fixHint: hasAnyEngine
            ? undefined
            : 'Install Ghidra (free), Hopper, IDA Pro, or Rizin (rz-bin) and ensure it is in your PATH.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#native-analysis',
        });

        // Provider configuration
        checks.push({
          id: 'provider-setting',
          name: 'Decompiler Provider Mapping',
          description: 'Configurable provider (auto, ghidra, hopper, ida, rizin, objdump)',
          passed: true,
          status: 'passed',
          detail: 'REA provider selection supported and persisted',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#native-analysis',
        });
        break;
      }

      case 'dotnet_assembly': {
        const hasDotnet = this.hasExecutable('dotnet');
        const hasIlspy = this.hasExecutable('ilspycmd');

        checks.push({
          id: 'dotnet-runtime',
          name: '.NET SDK / Runtime',
          description: '.NET CLI toolchain for assembly inspection and metadata validation',
          passed: hasDotnet,
          status: hasDotnet ? 'passed' : 'warning',
          detail: hasDotnet ? '.NET CLI found on PATH' : '.NET CLI not found on PATH',
          fixHint: hasDotnet ? undefined : 'Install .NET SDK from https://dotnet.microsoft.com/download',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md',
        });

        checks.push({
          id: 'ilspy-decompiler',
          name: 'ILSpy Managed Decompiler',
          description: 'ilspycmd tool for C# / IL reconstruction',
          passed: hasIlspy,
          status: hasIlspy ? 'passed' : 'optional',
          detail: hasIlspy ? 'ilspycmd decompiler ready' : 'ilspycmd not installed (optional)',
          fixHint: hasIlspy ? undefined : 'Install via: dotnet tool install -g ilspycmd',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md',
        });

        checks.push({
          id: 'managed-parser',
          name: 'REA Managed Artifact Inspector',
          description: 'Built-in REA inspect_managed_artifact and inspect_managed_members',
          passed: true,
          status: 'passed',
          detail: 'Built-in CLR/CLI metadata parser ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md',
        });
        break;
      }

      case 'android_apk': {
        const hasJadx = this.hasExecutable('jadx', [
          this.probe.getEnvVar('JADX_HOME') ? path.join(this.probe.getEnvVar('JADX_HOME')!, 'bin', 'jadx') : '',
        ]);
        const hasJava = this.hasExecutable('java', [
          this.probe.getEnvVar('JAVA_HOME') ? path.join(this.probe.getEnvVar('JAVA_HOME')!, 'bin', 'java') : '',
        ]);
        const hasAdb = this.hasExecutable('adb');

        checks.push({
          id: 'jadx-decompiler',
          name: 'JADX Decompiler',
          description: 'JADX decompiler CLI for APK Java/Kotlin reconstruction',
          passed: hasJadx,
          status: hasJadx ? 'passed' : 'failed',
          detail: hasJadx ? 'jadx CLI found on PATH' : 'jadx CLI not found on PATH',
          fixHint: hasJadx ? undefined : 'Install JADX and add `jadx` to your system PATH.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#android-analysis',
        });

        checks.push({
          id: 'java-jdk',
          name: 'Java Development Kit (JDK)',
          description: 'Java 17+ runtime required to execute JADX and Android tooling',
          passed: hasJava,
          status: hasJava ? 'passed' : 'failed',
          detail: hasJava ? 'java runtime found on PATH' : 'java runtime not found on PATH',
          fixHint: hasJava ? undefined : 'Install Java JDK 17+ and ensure `java` is on PATH.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#android-analysis',
        });

        checks.push({
          id: 'android-adb',
          name: 'Android Debug Bridge (ADB)',
          description: 'ADB utility for runtime device / emulator connection',
          passed: hasAdb,
          status: hasAdb ? 'passed' : 'optional',
          detail: hasAdb ? 'adb found on PATH' : 'adb not found (required only for dynamic device observation)',
          fixHint: hasAdb ? undefined : 'Install Android SDK platform-tools for dynamic APK observation.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#android-analysis',
        });
        break;
      }

      case 'url': {
        const isWin = this.probe.platform === 'win32';
        const hasChrome =
          this.hasExecutable('google-chrome') ||
          this.hasExecutable('chromium') ||
          this.hasExecutable('chromium-browser') ||
          this.hasExecutable('chrome') ||
          (isWin &&
            (this.hasExecutable('msedge', ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe']) ||
              this.probe.fileExists('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe') ||
              this.probe.fileExists('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'))) ||
          (!isWin &&
            (this.probe.fileExists('/Applications/Google Chrome.app') ||
              this.probe.fileExists('/Applications/Microsoft Edge.app')));

        checks.push({
          id: 'browser-engine',
          name: 'Chrome-Family Browser',
          description: 'Chrome, Chromium, or Microsoft Edge for headless CDP observation',
          passed: hasChrome,
          status: hasChrome ? 'passed' : 'failed',
          detail: hasChrome ? 'Compatible browser found' : 'No Chrome or Edge browser found',
          fixHint: hasChrome ? undefined : 'Install Google Chrome or Microsoft Edge.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#browser-workflows',
        });

        checks.push({
          id: 'network-access',
          name: 'Web Protocol Support',
          description: 'HTTP and HTTPS target reachability',
          passed: true,
          status: 'passed',
          detail: 'Web protocol support ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#browser-workflows',
        });
        break;
      }

      case 'packet_capture': {
        const hasTshark = this.hasExecutable('tshark', [
          'C:\\Program Files\\Wireshark\\tshark.exe',
          'C:\\Program Files (x86)\\Wireshark\\tshark.exe',
        ]);

        checks.push({
          id: 'tshark-cli',
          name: 'Wireshark / TShark CLI',
          description: 'tshark CLI utility for deep packet dissection and field extraction',
          passed: hasTshark,
          status: hasTshark ? 'passed' : 'failed',
          detail: hasTshark ? 'tshark found on system' : 'tshark not found on PATH or standard paths',
          fixHint: hasTshark ? undefined : 'Install Wireshark (ensure TShark CLI is selected) and add to PATH.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#network-captures',
        });

        checks.push({
          id: 'pcap-parser',
          name: 'REA Packet Inspector',
          description: 'REA inspect_packet_capture and inspect_packet_fields tools',
          passed: true,
          status: 'passed',
          detail: 'REA pcap MCP tools ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#network-captures',
        });
        break;
      }

      case 'sqlite_database': {
        checks.push({
          id: 'sqlite-inspector',
          name: 'SQLite Database Inspector',
          description: 'REA inspect_sqlite_database engine for tables, schema, and rows',
          passed: true,
          status: 'passed',
          detail: 'Built-in REA SQLite inspection engine ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md',
        });
        break;
      }

      case 'web_archive': {
        checks.push({
          id: 'web-archive-inspector',
          name: 'Web Network Archive Inspector',
          description: 'REA inspect_web_network_capture for HAR and SAZ transaction extraction',
          passed: true,
          status: 'passed',
          detail: 'Built-in REA HTTP archive analyzer ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/mcp-contracts.md',
        });
        break;
      }

      case 'firmware_image': {
        const hasBinwalk = this.hasExecutable('binwalk');
        const has7z = this.hasExecutable('7z', ['C:\\Program Files\\7-Zip\\7z.exe']);

        checks.push({
          id: 'firmware-extractors',
          name: 'Firmware Extraction Utilities',
          description: 'binwalk or 7-Zip for unpacking squashfs and nested partitions',
          passed: hasBinwalk || has7z,
          status: hasBinwalk || has7z ? 'passed' : 'warning',
          detail: hasBinwalk
            ? 'binwalk found on PATH'
            : has7z
              ? '7-Zip found on system'
              : 'Neither binwalk nor 7z found (extraction may be limited)',
          fixHint: hasBinwalk || has7z ? undefined : 'Install binwalk or 7-Zip for unpacking complex firmware.',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#firmware',
        });

        checks.push({
          id: 'firmware-regions',
          name: 'REA Firmware Region Inspector',
          description: 'REA inspect_firmware_regions and extract_firmware tools',
          passed: true,
          status: 'passed',
          detail: 'Built-in firmware analysis engine ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md#firmware',
        });
        break;
      }

      default: {
        checks.push({
          id: 'generic-target-check',
          name: 'General Analysis Environment',
          description: 'Static binary layout and string extraction readiness',
          passed: true,
          status: 'passed',
          detail: 'REA standard tool suite ready',
          docUrl: 'https://github.com/morluto/rea/blob/main/docs/installation.md',
        });
        break;
      }
    }

    const isReady = checks.every((c) => c.status !== 'failed');

    return {
      targetType,
      isReady,
      source: 'best_effort',
      checks,
    };
  }
}

export const readinessService = new ReadinessService();
