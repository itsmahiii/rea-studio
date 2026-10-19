import { safeStorage, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * OS Keychain integration via Electron safeStorage (Windows DPAPI / macOS Keychain / Linux Secret Service).
 * Stores encrypted model provider API keys.
 * Never logs or exposes raw keys to the renderer.
 */
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

export class KeychainService {
  private secretsPath: string;

  constructor() {
    this.secretsPath = path.join(getUserDataPath(), 'rea_credentials.bin');
  }

  private readCredentialsMap(): Record<string, string> {
    if (!fs.existsSync(this.secretsPath)) {
      return {};
    }
    if (!safeStorage.isEncryptionAvailable()) {
      return {};
    }
    try {
      const encrypted = fs.readFileSync(this.secretsPath);
      const decrypted = safeStorage.decryptString(encrypted);
      if (!decrypted) return {};
      // Try parsing as JSON map
      try {
        const parsed = JSON.parse(decrypted);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as Record<string, string>;
        }
      } catch {
        // Legacy format: raw string for anthropic
        return { anthropic: decrypted };
      }
      return {};
    } catch {
      return {};
    }
  }

  private writeCredentialsMap(map: Record<string, string>): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available on this platform.');
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(map));
    fs.mkdirSync(path.dirname(this.secretsPath), { recursive: true });
    fs.writeFileSync(this.secretsPath, encrypted);
    return true;
  }

  public hasApiKey(provider: string = 'anthropic'): boolean {
    try {
      const map = this.readCredentialsMap();
      const key = map[provider];
      return typeof key === 'string' && key.length > 0;
    } catch {
      return false;
    }
  }

  public setApiKey(apiKey: string, provider: string = 'anthropic'): boolean {
    const map = this.readCredentialsMap();
    map[provider] = apiKey;
    return this.writeCredentialsMap(map);
  }

  public getApiKey(provider: string = 'anthropic'): string | null {
    const map = this.readCredentialsMap();
    return map[provider] || null;
  }

  public clearApiKey(provider?: string): boolean {
    try {
      if (!fs.existsSync(this.secretsPath)) {
        return true;
      }
      if (!provider) {
        fs.unlinkSync(this.secretsPath);
        return true;
      }
      const map = this.readCredentialsMap();
      delete map[provider];
      if (Object.keys(map).length === 0) {
        fs.unlinkSync(this.secretsPath);
      } else {
        this.writeCredentialsMap(map);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const keychain = new KeychainService();
