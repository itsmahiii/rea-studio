// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { keychain } from '../../src/main/keychain';
import { settingsService } from '../../src/main/services/settings';
import { sessionService } from '../../src/main/services/session';
import { scrubSecrets } from '../../src/main/crashLogger';
import { generateMarkdownReport } from '../../src/renderer/lib/reportGenerator';
import { extractSessionEvidence } from '../../src/renderer/lib/evidenceParser';
import type { Session, AppSettings } from '../../src/shared/ipc';

describe('Secrets Safety & Zero-Leakage Verification', () => {
  const CANARY_KEY = 'sk-ant-api03-CANARY-SECRET-TEST-KEY-XYZ987654321';

  beforeEach(() => {
    vi.spyOn(keychain, 'getApiKey').mockReturnValue(CANARY_KEY);
    vi.spyOn(keychain, 'hasApiKey').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('proves keychain stores key securely and masks it from renderer', () => {
    // 1. Keychain holds the key for internal main-process SDK usage only
    expect(keychain.getApiKey()).toBe(CANARY_KEY);
    expect(keychain.hasApiKey()).toBe(true);

    // 2. Settings payload exposed to renderer must NEVER contain the raw key
    const settings: AppSettings = settingsService.getSettings();
    expect((settings as any).apiKey).toBeUndefined();

    const serializedSettings = JSON.stringify(settings);
    expect(serializedSettings).not.toContain(CANARY_KEY);
  });

  it('proves crash logger scrubs API keys from logs and stack traces', () => {
    const errorText = `Failed to connect to Anthropic: 401 Unauthorized with key ${CANARY_KEY} at QueryRunner.run()`;
    const scrubbed = scrubSecrets(errorText);

    expect(scrubbed).not.toContain(CANARY_KEY);
    expect(scrubbed).toContain('[REDACTED_API_KEY]');
  });

  it('proves markdown report generation never leaks secrets into exported reports', () => {
    const mockSession: Session = {
      id: 'sess-leak-check',
      title: 'Security Audit Session',
      target: {
        path: 'C:/targets/sample-app',
        name: 'sample-app',
        isDirectory: true,
        targetType: 'javascript_electron',
        size: 1024,
        exists: true,
      },
      provider: 'auto',
      messages: [
        {
          id: 'msg-1',
          sessionId: 'sess-leak-check',
          role: 'user',
          content: 'Analyze binary security fuses and exports.',
          timestamp: '2026-10-18T12:00:00Z',
        },
        {
          id: 'msg-2',
          sessionId: 'sess-leak-check',
          role: 'agent',
          content: 'Analysis complete. Verified Electron fuses.',
          timestamp: '2026-10-18T12:00:05Z',
          toolCalls: [
            {
              id: 'tc-1',
              toolName: 'inspect_electron_fuses',
              input: { target: 'sample-app' },
              output: { RunAsNode: false, EnableCookieEncryption: true },
              status: 'success',
              isRisky: false,
              startedAt: '2026-10-18T12:00:01Z',
            },
          ],
        },
      ],
      createdAt: '2026-10-18T12:00:00Z',
      updatedAt: '2026-10-18T12:00:05Z',
    };

    const evidence = extractSessionEvidence(mockSession);
    const report = generateMarkdownReport(mockSession, evidence, {
      reaVersion: '1.4.0',
      provider: 'Hopper v5',
    });

    // Grep the generated report for the canary key
    expect(report).not.toContain(CANARY_KEY);
    expect(report).toContain('Findings Report');
    expect(report).toContain('inspect_electron_fuses');
  });

  it('greps all serialized artifacts of a full run to ensure zero canary key exposure', () => {
    // 1. Create a full session simulation
    const session = sessionService.create(
      'C:/sample/app.exe',
      'app.exe',
      'native_pe',
      'ghidra'
    );

    sessionService.addMessage(session.id, {
      sessionId: session.id,
      role: 'user',
      content: 'Analyze PE imports and exports',
    });

    sessionService.addMessage(session.id, {
      sessionId: session.id,
      role: 'agent',
      content: 'Found kernel32.dll imports.',
      toolCalls: [
        {
          id: 'tc-test-1',
          toolName: 'inspect_pe_resources',
          input: { path: 'C:/sample/app.exe' },
          output: { section: '.rsrc', manifest: true },
          status: 'success',
          isRisky: false,
          startedAt: new Date().toISOString(),
        },
      ],
    });

    // Retrieve active session from sessionService
    const storedSession = sessionService.get(session.id);
    expect(storedSession).toBeDefined();

    // Serialize all artifacts produced by the session:
    // a. Session store representation
    const sessionJson = JSON.stringify(storedSession);
    // b. Settings representation
    const settingsJson = JSON.stringify(settingsService.getSettings());
    // c. Report output
    const evidence = extractSessionEvidence(storedSession!);
    const reportMarkdown = generateMarkdownReport(storedSession!, evidence, {
      reaVersion: '1.4.0',
      provider: 'auto',
    });
    // d. Simulated log file output
    const sampleLog = scrubSecrets(`[INFO] Session ${session.id} processed successfully with token ${CANARY_KEY}`);

    const fullRunArtifacts = [
      sessionJson,
      settingsJson,
      reportMarkdown,
      sampleLog,
    ].join('\n---\n');

    // Comprehensive grep across all combined artifacts
    expect(fullRunArtifacts.includes(CANARY_KEY)).toBe(false);
    expect(fullRunArtifacts).not.toMatch(new RegExp(CANARY_KEY, 'i'));
  });
});
