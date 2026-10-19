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

  public hasApiKey(): boolean {
    try {
      if (!fs.existsSync(this.secretsPath)) {
        return false;
      }
      const data = fs.readFileSync(this.secretsPath);
      return data.length > 0;
    } catch {
      return false;
    }
  }

  public setApiKey(apiKey: string): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available on this platform.');
    }
    const encrypted = safeStorage.encryptString(apiKey);
    fs.mkdirSync(path.dirname(this.secretsPath), { recursive: true });
    fs.writeFileSync(this.secretsPath, encrypted);
    return true;
  }

  public getApiKey(): string | null {
    if (!fs.existsSync(this.secretsPath)) {
      return null;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available on this platform.');
    }
    try {
      const encrypted = fs.readFileSync(this.secretsPath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  }

  public clearApiKey(): boolean {
    try {
      if (fs.existsSync(this.secretsPath)) {
        fs.unlinkSync(this.secretsPath);
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const keychain = new KeychainService();
