import { app, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { processManager } from './processManager';
import { findExecutable, getEnrichedPath } from './pathResolver';
import type {
  AppSettings,
  UpdateSettingsRequest,
  CheckUpdateResponse,
  RunUpdateResponse,
} from '../../shared/ipc';
import { sessionService } from './session';
import { keychain } from '../keychain';

function getUserDataPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // fallback outside electron process
  }
  return process.env.APPDATA
    ? path.join(process.env.APPDATA, 'rea-studio')
    : path.join(process.cwd(), '.rea-data');
}

export const DEFAULT_SETTINGS: AppSettings = {
  hasAcceptedLegal: false,
  hasCompletedOnboarding: false,
  modelProvider: 'anthropic',
  providerBaseUrl: '',
  selectedModel: 'claude-3-7-sonnet-20250219',
  customModel: '',
  nativeProvider: 'auto',
  reaCommandOverride: '',
  envOverrides: {
    REA_GHIDRA_STARTUP_TIMEOUT_MS: 60000,
    REA_HOPPER_STARTUP_TIMEOUT_MS: 30000,
    REA_JEB_MCP_URL: '',
    REA_MCP_MAX_RESPONSE_BYTES: 10485760,
  },
  analysisTimeoutSeconds: 120,
  theme: 'dark',
};

export class SettingsService {
  private settingsFile: string;
  private settings: AppSettings;

  constructor() {
    this.settingsFile = path.join(getUserDataPath(), 'rea_settings.json');
    this.settings = this.loadFromDisk();
  }

  private loadFromDisk(): AppSettings {
    try {
      if (fs.existsSync(this.settingsFile)) {
        const raw = fs.readFileSync(this.settingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          envOverrides: {
            ...DEFAULT_SETTINGS.envOverrides,
            ...(parsed.envOverrides || {}),
          },
          userDataPath: getUserDataPath(),
        };
      }
    } catch (err) {
      console.error('Failed to load settings from disk:', err);
    }
    return {
      ...DEFAULT_SETTINGS,
      userDataPath: getUserDataPath(),
    };
  }

  private saveToDisk(): void {
    try {
      fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true });
      fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings to disk:', err);
    }
  }

  public getSettings(): AppSettings {
    this.settings.userDataPath = getUserDataPath();
    return { ...this.settings };
  }

  public updateSettings(partial: UpdateSettingsRequest): AppSettings {
    this.settings = {
      ...this.settings,
      ...partial,
      envOverrides: {
        ...this.settings.envOverrides,
        ...(partial.envOverrides || {}),
      },
      userDataPath: getUserDataPath(),
    };
    this.saveToDisk();
    return { ...this.settings };
  }

  public clearAllLocalData(): boolean {
    try {
      // 1. Clear all session records
      sessionService.clearAll();

      // 2. Clear API key from OS Keychain
      keychain.clearApiKey();

      // 3. Reset settings to default
      this.settings = {
        ...DEFAULT_SETTINGS,
        userDataPath: getUserDataPath(),
      };
      if (fs.existsSync(this.settingsFile)) {
        fs.unlinkSync(this.settingsFile);
      }
      return true;
    } catch (err) {
      console.error('Failed to clear local data:', err);
      return false;
    }
  }

  public async checkForUpdates(): Promise<CheckUpdateResponse> {
    const currentVersion = '6.7.0';
    const updateCommand = 'npx -y rea-agents@latest --update';

    try {
      const isWin = process.platform === 'win32';
      const npmName = isWin ? 'npm.cmd' : 'npm';
      const npmExecutable = findExecutable(npmName) || npmName;
      const enrichedPath = getEnrichedPath();

      const result = await processManager.safeExecFile(
        npmExecutable,
        ['view', 'rea-agents', 'version'],
        {
          timeout: 8000,
          maxBuffer: 1024 * 1024,
          env: { ...(process.env as Record<string, string>), PATH: enrichedPath },
        }
      );
      const latestVersion = result.stdout.trim() || currentVersion;
      return {
        currentVersion,
        latestVersion,
        updateAvailable: latestVersion !== currentVersion,
        updateCommand,
      };
    } catch {
      return {
        currentVersion,
        latestVersion: currentVersion,
        updateAvailable: false,
        updateCommand,
      };
    }
  }

  public async runUpdate(confirmed: boolean): Promise<RunUpdateResponse> {
    if (!confirmed) {
      return {
        success: false,
        output: 'Update cancelled. User confirmation is strictly required prior to running external commands.',
      };
    }

    try {
      // Spawn directly with argument arrays (no shell interpretation)
      // Never modifies agent configs outside this app.
      const isWin = process.platform === 'win32';
      const npxName = isWin ? 'npx.cmd' : 'npx';
      const npxExecutable = findExecutable(npxName) || npxName;
      const enrichedPath = getEnrichedPath();

      const result = await processManager.safeExecFile(
        npxExecutable,
        ['-y', 'rea-agents@latest', '--update'],
        {
          timeout: 180_000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...(process.env as Record<string, string>), PATH: enrichedPath },
        }
      );
      const output = (result.stdout + (result.stderr ? `\nSTDERR:\n${result.stderr}` : '')).trim();
      return {
        success: true,
        output: output || 'REA update executed successfully.',
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `Update execution failed: ${errMsg}`,
      };
    }
  }

  public async openDataDir(): Promise<boolean> {
    try {
      const p = getUserDataPath();
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
      await shell.openPath(p);
      return true;
    } catch {
      return false;
    }
  }
}

export const settingsService = new SettingsService();
