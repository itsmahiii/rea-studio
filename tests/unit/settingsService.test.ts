import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsService, DEFAULT_SETTINGS } from '../../src/main/services/settings';
import { sessionService } from '../../src/main/services/session';
import { keychain } from '../../src/main/keychain';
import * as child_process from 'child_process';

vi.mock('child_process', () => ({
  exec: vi.fn((cmd: string, opts: unknown, cb?: unknown) => {
    const callback = (typeof opts === 'function' ? opts : cb) as (err: Error | null, stdout: string, stderr: string) => void;
    if (callback) {
      callback(null, '6.7.0', '');
    }
    return {} as unknown as child_process.ChildProcess;
  }),
}));

import * as os from 'os';

describe('SettingsService', () => {
  let service: SettingsService;
  let testSettingsPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testSettingsPath = path.join(
      os.tmpdir(),
      `test-rea-settings-${Date.now()}-${Math.random().toString(36).substring(2)}.json`
    );
    service = new SettingsService(testSettingsPath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testSettingsPath)) {
        fs.unlinkSync(testSettingsPath);
      }
    } catch {
      // ignore
    }
  });

  it('loads default settings when no config file exists', () => {
    const settings = service.getSettings();
    expect(settings.hasAcceptedLegal).toBe(false);
    expect(settings.hasCompletedOnboarding).toBe(false);
    expect(settings.selectedModel).toBe('claude-3-7-sonnet-20250219');
    expect(settings.nativeProvider).toBe('auto');
    expect(settings.theme).toBe('dark');
    expect(settings.analysisTimeoutSeconds).toBe(120);
  });

  it('updates partial settings and retains existing properties', () => {
    const updated = service.updateSettings({
      selectedModel: 'claude-3-5-sonnet-20241022',
      analysisTimeoutSeconds: 180,
      envOverrides: {
        REA_GHIDRA_STARTUP_TIMEOUT_MS: 90000,
      },
    });

    expect(updated.selectedModel).toBe('claude-3-5-sonnet-20241022');
    expect(updated.analysisTimeoutSeconds).toBe(180);
    expect(updated.envOverrides.REA_GHIDRA_STARTUP_TIMEOUT_MS).toBe(90000);
    expect(updated.envOverrides.REA_HOPPER_STARTUP_TIMEOUT_MS).toBe(30000); // Retained default
  });

  it('clearAllLocalData wipes sessions, clears keychain, and resets settings', () => {
    const clearSessionsSpy = vi.spyOn(sessionService, 'clearAll').mockReturnValue(true);
    const clearApiKeySpy = vi.spyOn(keychain, 'clearApiKey').mockReturnValue(true);

    service.updateSettings({ hasAcceptedLegal: true, hasCompletedOnboarding: true });
    expect(service.getSettings().hasCompletedOnboarding).toBe(true);

    const cleared = service.clearAllLocalData();
    expect(cleared).toBe(true);
    expect(clearSessionsSpy).toHaveBeenCalled();
    expect(clearApiKeySpy).toHaveBeenCalled();

    const resetSettings = service.getSettings();
    expect(resetSettings.hasCompletedOnboarding).toBe(false);
    expect(resetSettings.hasAcceptedLegal).toBe(false);
  });

  it('runUpdate requires explicit confirmation', async () => {
    const unconfirmedResult = await service.runUpdate(false);
    expect(unconfirmedResult.success).toBe(false);
    expect(unconfirmedResult.output.toLowerCase()).toContain('confirmation is strictly required');
  });

  it('checkForUpdates returns version comparison and update command', async () => {
    const check = await service.checkForUpdates();
    expect(check.currentVersion).toBe('6.7.0');
    expect(check.updateCommand).toBe('npx -y rea-agents@latest --update');
  });
});
