import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

interface TestAppStoreState {
  setHasApiKey: (has: boolean) => void;
  setActiveSession: (session: unknown) => void;
  setRunState: (state: string, tool?: string | null, error?: string | null) => void;
  appendMessage: (msg: unknown) => void;
  appendToken: (id: string, token: string) => void;
  completeStreamingMessage: () => void;
  addApprovalRequest: (req: unknown) => void;
  upsertToolCall: (tc: unknown) => void;
}

declare global {
  interface Window {
    __APP_STORE__?: {
      getState: () => TestAppStoreState;
    };
  }
}

test('Center Chat Pane: Idle, Streaming, Tool Card, Permission Card, and Error States', async () => {
  const screenshotsDir =
    'C:/Users/itsma/.gemini/antigravity-ide/brain/197714f3-cee5-40b6-9ecc-66a079d4909f/screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const tempUserDataDir = path.join(import.meta.dirname, '../../.tmp-chat-test-profile');
  fs.mkdirSync(tempUserDataDir, { recursive: true });
  fs.writeFileSync(
    path.join(tempUserDataDir, 'rea_settings.json'),
    JSON.stringify({ hasCompletedOnboarding: true, hasAcceptedLegal: true })
  );

  const electronApp = await electron.launch({
    args: [
      path.join(import.meta.dirname, '../../dist-electron/index.js'),
      `--user-data-dir=${tempUserDataDir}`,
    ],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  // Set window size for crisp screenshots
  await page.setViewportSize({ width: 1280, height: 800 });

  // Wait for React and store initialization
  await page.waitForFunction(() => {
    return typeof window.__APP_STORE__?.getState === 'function';
  });

  // 1. Setup Active Session & API Key for Idle State
  await page.evaluate(() => {
    const store = window.__APP_STORE__?.getState();
    if (store) {
      store.setHasApiKey(true);
      store.setActiveSession({
        id: 'session-demo-1',
        title: 'VSCode ASAR Investigation',
        target: {
          path: 'C:/Users/itsma/AppData/Local/Programs/Microsoft VS Code/resources/app.asar',
          name: 'app.asar',
          targetType: 'electron_asar',
          isDirectory: false,
          size: 52428800,
          exists: true,
        },
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      store.setRunState('idle');
    }
  });

  // Verify chat pane and starter chips are displayed
  const chatPane = page.locator('[data-testid="chat-pane"]');
  await expect(chatPane).toBeVisible();

  const starterChips = page.locator('text=Suggested Investigations');
  await expect(starterChips).toBeVisible();

  // Screenshot 1: Idle state
  await page.screenshot({
    path: path.join(screenshotsDir, 'chat-1-idle.png'),
  });

  // 2. Simulate User Typing and Sending a Prompt
  const composer = page.locator('[data-testid="chat-composer-textarea"]');
  await composer.fill('Map the main/preload/renderer boundaries and IPC channels');

  // Trigger streaming tokens
  await page.evaluate(() => {
    const store = window.__APP_STORE__?.getState();
    if (store) {
      store.appendMessage({
        id: 'msg-user-1',
        sessionId: 'session-demo-1',
        role: 'user',
        content: 'Map the main/preload/renderer boundaries and IPC channels',
        timestamp: new Date().toISOString(),
      });
      store.appendToken(
        'msg-agent-1',
        'I am analyzing the ASAR bundle structure. Here is the initial architectural layout:\n\n' +
          '### Boundary Analysis\n\n' +
          '- **Main Process**: `src/main.js` (orchestrates native windows & lifecycle)\n' +
          '- **Preload Script**: `src/vs/workbench/workbench.desktop.main.js` (`contextIsolation: true`)\n' +
          '- **Renderer**: Multi-window Chromium webContents\n\n' +
          '```typescript\n' +
          '// Registered IPC invoker channel in preload\n' +
          'ipcRenderer.invoke("workbench:openWindow", { uri: targetPath });\n' +
          '```\n\n' +
          'Let me inspect the exact registered IPC handlers and security fuses now...',
      );
      store.setRunState('thinking');
    }
  });

  const streamingMessage = page.locator('[data-testid="streaming-message"]');
  await expect(streamingMessage).toBeVisible();

  const streamingCursor = page.locator('[data-testid="streaming-cursor"]');
  await expect(streamingCursor).toBeVisible();

  // Screenshot 2: Streaming state
  await page.screenshot({
    path: path.join(screenshotsDir, 'chat-2-streaming.png'),
  });

  // 3. Complete streaming and render Tool Call Card
  await page.evaluate(() => {
    const store = window.__APP_STORE__?.getState();
    if (store) {
      store.completeStreamingMessage();
      store.appendMessage({
        id: 'msg-agent-1',
        sessionId: 'session-demo-1',
        role: 'agent',
        content:
          'I ran `analyze_javascript_application` to extract the full Electron IPC channel map and security fuses. Here are the findings with evidence:',
        timestamp: new Date().toISOString(),
        toolCalls: [
          {
            id: 'tc-demo-1',
            toolName: 'analyze_javascript_application',
            input: {
              entryPoint: 'src/main.js',
              scanPreload: true,
              auditFuses: true,
            },
            output: {
              fuses: {
                runAsNode: false,
                enableCookieEncryption: true,
                enableNodeCliInspectArguments: false,
              },
              ipcChannels: [
                'workbench:openWindow',
                'workbench:telemetryEvent',
                'workbench:showSaveDialog',
              ],
              securityPosture: 'Strong context isolation enabled with hardened preload bridge.',
            },
            status: 'success',
            isRisky: false,
            startedAt: '2026-10-18T14:30:00.000Z',
            completedAt: '2026-10-18T14:30:00.320Z',
          },
        ],
      });
      store.setRunState('idle');
    }
  });

  // Expand the tool card
  const toolCard = page.locator('[data-testid="tool-card-tc-demo-1"]');
  await expect(toolCard).toBeVisible();
  await toolCard.locator('button').first().click();

  const staticBadge = page.locator('[data-testid="badge-static"]');
  await expect(staticBadge).toBeVisible();

  // Screenshot 3: Tool Call Card state
  await page.screenshot({
    path: path.join(screenshotsDir, 'chat-3-tool-card.png'),
  });

  // 4. Permission Card State (Risky Action Request)
  await page.evaluate(() => {
    const store = window.__APP_STORE__?.getState();
    if (store) {
      store.addApprovalRequest({
        approvalId: 'approval-scenario-1',
        sessionId: 'session-demo-1',
        toolName: 'capture_electron_scenario',
        params: {
          debuggerPort: 9222,
          durationSeconds: 15,
          attachToAllWindows: true,
        },
        reason:
          'Connect to live Electron CDP debugging target to record runtime DOM interactions and console events.',
        requestedAt: new Date().toISOString(),
      });
      store.setRunState('waiting_approval');
    }
  });

  const permissionCard = page.locator('[data-testid="permission-card-approval-scenario-1"]');
  await expect(permissionCard).toBeVisible();

  const allowBtn = page.locator('[data-testid="permission-allow-btn"]');
  await expect(allowBtn).toBeVisible();

  // Screenshot 4: Permission Card state
  await page.screenshot({
    path: path.join(screenshotsDir, 'chat-4-permission-card.png'),
  });

  // Click Allow Once on Permission Card
  await allowBtn.click();
  await expect(permissionCard).not.toBeVisible();

  // 5. Error State
  await page.evaluate(() => {
    const store = window.__APP_STORE__?.getState();
    if (store) {
      store.setRunState(
        'error',
        null,
        'Failed to connect to Electron debugging port 9222: Connection refused.',
      );
      store.upsertToolCall({
        id: 'tc-err-1',
        toolName: 'capture_electron_scenario',
        input: { debuggerPort: 9222 },
        error: 'ECONNREFUSED 127.0.0.1:9222 - Target process did not launch with --remote-debugging-port=9222',
        status: 'error',
        isRisky: true,
        startedAt: '2026-10-18T14:31:00.000Z',
        completedAt: '2026-10-18T14:31:01.100Z',
      });
    }
  });

  const errorIndicator = page.locator('[data-testid="run-state-error"]');
  await expect(errorIndicator).toBeVisible();

  // Expand error tool card
  const errorToolCard = page.locator('[data-testid="tool-card-tc-err-1"]');
  if (await errorToolCard.isVisible()) {
    await errorToolCard.locator('button').first().click();
  }

  // Screenshot 5: Error state
  await page.screenshot({
    path: path.join(screenshotsDir, 'chat-5-error.png'),
  });

  await electronApp.close();
});
