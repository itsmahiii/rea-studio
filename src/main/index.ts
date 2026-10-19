import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc/handlers';
import { initCrashLogger } from './crashLogger';
import { agentService } from './services/agent';
import { processManager } from './services/processManager';

// 1. Initialize safe crash logger immediately at process boot
initCrashLogger();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'REA Studio',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Strict Security Controls:

  // 1. Block all navigation away from the application
  win.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  win.webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });

  // 2. Deny opening new windows (e.g., window.open, target="_blank")
  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Load URL or File
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

// 3. Deny all permission requests and checks by default
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler(() => {
    return false;
  });

  // Strict Content-Security-Policy header: NO eval, NO unsafe-eval
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
    const connectSrc = isDev
      ? "connect-src 'self' ws://localhost:* http://localhost:* https://api.anthropic.com;"
      : "connect-src 'self' https://api.anthropic.com;";

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; ${connectSrc}`,
        ],
      },
    });
  });

  registerIpcHandlers(() => mainWindow);

  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

// 4. Ensure no orphan REA / decompiler processes remain on quit
app.on('before-quit', () => {
  try {
    agentService.cleanup();
    processManager.killAll();
  } catch (err) {
    console.error('Error during shutdown cleanup:', err);
  }
});

process.on('exit', () => {
  try {
    processManager.killAll();
  } catch {
    // exit
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
