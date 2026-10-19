import { describe, it, expect } from 'vitest';
import { ReadinessService, type EnvironmentProbe } from '@/main/services/readiness';

class MockEnvironmentProbe implements EnvironmentProbe {
  public commands = new Set<string>();
  public files = new Set<string>();
  public envVars: Record<string, string> = {};
  public platform: NodeJS.Platform = 'linux';

  public isCommandOnPath(command: string): boolean {
    return this.commands.has(command);
  }

  public fileExists(filePath: string): boolean {
    return this.files.has(filePath);
  }

  public getEnvVar(name: string): string | undefined {
    return this.envVars[name];
  }
}

describe('Target Readiness & Pre-Flight Logic', () => {
  it('passes JavaScript/Electron checks when Node and process tools are present', () => {
    const probe = new MockEnvironmentProbe();
    probe.platform = 'linux';
    probe.commands.add('ps');

    const service = new ReadinessService(probe);
    const report = service.getReadiness('javascript_electron');

    expect(report.targetType).toBe('javascript_electron');
    expect(report.source).toBe('best_effort');
    expect(report.isReady).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(3);

    const nodeCheck = report.checks.find((c) => c.id === 'node-runtime');
    expect(nodeCheck?.passed).toBe(true);

    const procCheck = report.checks.find((c) => c.id === 'process-inspection');
    expect(procCheck?.passed).toBe(true);
  });

  it('fails JavaScript/Electron when process inspection tool (ps) is missing on Linux', () => {
    const probe = new MockEnvironmentProbe();
    probe.platform = 'linux';
    // Do not add 'ps'

    const service = new ReadinessService(probe);
    const report = service.getReadiness('javascript_electron');

    expect(report.isReady).toBe(false);
    const procCheck = report.checks.find((c) => c.id === 'process-inspection');
    expect(procCheck?.status).toBe('failed');
    expect(procCheck?.fixHint).toContain('procps');
    expect(procCheck?.docUrl).toContain('javascript-application-workflows.md');
  });

  it('fails Native Binary check when no disassembler (Ghidra, Hopper, IDA, Rizin) is present', () => {
    const probe = new MockEnvironmentProbe();
    probe.platform = 'win32';

    const service = new ReadinessService(probe);
    const report = service.getReadiness('native_pe');

    expect(report.isReady).toBe(false);
    expect(report.source).toBe('best_effort');
    const engineCheck = report.checks.find((c) => c.id === 'native-disassembler');
    expect(engineCheck?.status).toBe('failed');
    expect(engineCheck?.fixHint).toContain('Ghidra');
    expect(engineCheck?.docUrl).toContain('docs/installation.md#native-analysis');
  });

  it('passes Native Binary check when Ghidra is detected on PATH', () => {
    const probe = new MockEnvironmentProbe();
    probe.commands.add('ghidraRun');

    const service = new ReadinessService(probe);
    const report = service.getReadiness('native_elf');

    expect(report.isReady).toBe(true);
    const engineCheck = report.checks.find((c) => c.id === 'native-disassembler');
    expect(engineCheck?.status).toBe('passed');
    expect(engineCheck?.detail).toContain('Ghidra');
  });

  it('fails Android APK checklist when JADX and Java are not found', () => {
    const probe = new MockEnvironmentProbe();

    const service = new ReadinessService(probe);
    const report = service.getReadiness('android_apk');

    expect(report.isReady).toBe(false);
    const jadxCheck = report.checks.find((c) => c.id === 'jadx-decompiler');
    expect(jadxCheck?.status).toBe('failed');
    expect(jadxCheck?.fixHint).toContain('JADX');

    const javaCheck = report.checks.find((c) => c.id === 'java-jdk');
    expect(javaCheck?.status).toBe('failed');
    expect(javaCheck?.fixHint).toContain('Java');

    const adbCheck = report.checks.find((c) => c.id === 'android-adb');
    expect(adbCheck?.status).toBe('optional');
  });

  it('passes Android APK checklist when JADX and Java are detected', () => {
    const probe = new MockEnvironmentProbe();
    probe.commands.add('jadx');
    probe.commands.add('java');

    const service = new ReadinessService(probe);
    const report = service.getReadiness('android_apk');

    expect(report.isReady).toBe(true);
    const jadxCheck = report.checks.find((c) => c.id === 'jadx-decompiler');
    expect(jadxCheck?.status).toBe('passed');
    const javaCheck = report.checks.find((c) => c.id === 'java-jdk');
    expect(javaCheck?.status).toBe('passed');
  });

  it('checks for Chrome-family browser when target is URL', () => {
    const probe = new MockEnvironmentProbe();
    const service = new ReadinessService(probe);

    // Browser missing
    const failedReport = service.getReadiness('url');
    expect(failedReport.isReady).toBe(false);
    const browserCheck = failedReport.checks.find((c) => c.id === 'browser-engine');
    expect(browserCheck?.status).toBe('failed');
    expect(browserCheck?.fixHint).toContain('Chrome');

    // Browser present
    probe.commands.add('google-chrome');
    const passedReport = service.getReadiness('url');
    expect(passedReport.isReady).toBe(true);
    const passedBrowser = passedReport.checks.find((c) => c.id === 'browser-engine');
    expect(passedBrowser?.status).toBe('passed');
  });

  it('checks for tshark CLI when target is packet capture', () => {
    const probe = new MockEnvironmentProbe();
    const service = new ReadinessService(probe);

    const reportNoTshark = service.getReadiness('packet_capture');
    expect(reportNoTshark.isReady).toBe(false);
    const tsharkCheck = reportNoTshark.checks.find((c) => c.id === 'tshark-cli');
    expect(tsharkCheck?.status).toBe('failed');
    expect(tsharkCheck?.docUrl).toContain('docs/installation.md#network-captures');

    probe.commands.add('tshark');
    const reportWithTshark = service.getReadiness('packet_capture');
    expect(reportWithTshark.isReady).toBe(true);
    expect(reportWithTshark.checks.find((c) => c.id === 'tshark-cli')?.status).toBe('passed');
  });
});
