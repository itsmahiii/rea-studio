import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

function getUserDataPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // fallback
  }
  return process.env.APPDATA
    ? path.join(process.env.APPDATA, 'rea-studio')
    : path.join(process.cwd(), '.rea-data');
}

/**
 * Scrubs potential secrets (Anthropic keys, bearer tokens, passwords)
 * from crash logs before writing to disk.
 */
export function scrubSecrets(input: string): string {
  if (!input) return '';
  return input
    // Match Anthropic API keys (sk-ant-...)
    .replace(/sk-ant-[a-zA-Z0-9_-]{20,}/gi, '[REDACTED_API_KEY]')
    // Match Generic API keys / Bearer tokens
    .replace(/bearer\s+[a-zA-Z0-9_.-]{20,}/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/api[_-]?key\s*[:=]\s*["']?[a-zA-Z0-9_-]{16,}["']?/gi, 'api_key: "[REDACTED]"');
}

export function initCrashLogger(): void {
  const crashLogPath = path.join(getUserDataPath(), 'crash.log');

  const logCrash = (type: string, error: unknown) => {
    try {
      const timestamp = new Date().toISOString();
      const message = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
      const scrubbed = scrubSecrets(message);
      const entry = `[${timestamp}] [${type}] ${scrubbed}\n${'-'.repeat(80)}\n`;

      fs.mkdirSync(path.dirname(crashLogPath), { recursive: true });
      fs.appendFileSync(crashLogPath, entry, 'utf-8');
    } catch (writeErr) {
      console.error('Failed to write crash log:', writeErr);
    }
  };

  process.on('uncaughtException', (error) => {
    logCrash('UNCAUGHT_EXCEPTION', error);
    console.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    logCrash('UNHANDLED_REJECTION', reason);
    console.error('Unhandled Rejection:', reason);
  });
}
