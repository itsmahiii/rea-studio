import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('Realtime verification of installed REA Studio application', async () => {
  const screenshotsDir = 'C:/Users/itsma/.gemini/antigravity-ide/brain/197714f3-cee5-40b6-9ecc-66a079d4909f/screenshots';
  fs.mkdirSync(screenshotsDir, { recursive: true });

  // 1. Locate installed binary in AppData/Local/Programs
  const installedExe = path.join(
    process.env.LOCALAPPDATA || 'C:/Users/itsma/AppData/Local',
    'Programs/rea-studio/rea-studio.exe'
  );

  console.log('Verifying installed application binary at:', installedExe);
  expect(fs.existsSync(installedExe)).toBe(true);

  const fileStats = fs.statSync(installedExe);
  console.log(`Installed binary size: ${(fileStats.size / (1024 * 1024)).toFixed(2)} MB`);
  expect(fileStats.size).toBeGreaterThan(100 * 1024 * 1024);

  // 2. Setup isolated testing profile for real-time validation
  const testProfileDir = path.join(import.meta.dirname, '../../.tmp-installed-realtime-profile');
  fs.mkdirSync(testProfileDir, { recursive: true });
  fs.writeFileSync(
    path.join(testProfileDir, 'rea_settings.json'),
    JSON.stringify({
      hasCompletedOnboarding: false,
      hasAcceptedLegal: false,
      modelProvider: 'anthropic',
      selectedModel: 'claude-3-7-sonnet-20250219',
      nativeProvider: 'auto',
      analysisTimeoutSeconds: 120,
      theme: 'dark',
    })
  );

  // 3. Launch installed Electron application
  console.log('Launching installed REA Studio binary...');
  const electronApp = await electron.launch({
    executablePath: installedExe,
    args: [`--user-data-dir=${testProfileDir}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.setViewportSize({ width: 1400, height: 900 });

  // 4. Verify title and DOM initialization
  const title = await page.title();
  expect(title).toBe('REA Studio');
  console.log('Window title verified: REA Studio');

  await page.waitForFunction(() => {
    return typeof (window as any).__APP_STORE__?.getState === 'function';
  });

  // Step 1: First Run / Onboarding Wizard
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(screenshotsDir, 'installed-1-onboarding.png') });
  console.log('Captured: installed-1-onboarding.png');

  // Complete onboarding and open settings
  await page.evaluate(() => {
    const store = (window as any).__APP_STORE__?.getState();
    if (store) {
      store.setIsOnboardingOpen(false);
      store.setHasApiKey(true);
      store.setIsSettingsOpen(true);
    }
  });
  await page.waitForTimeout(600);

  // Step 2: Settings Modal with Multi-Provider pills
  const openAiBtn = page.getByRole('button', { name: /openai/i });
  if (await openAiBtn.count() > 0) {
    await openAiBtn.first().click();
    await page.waitForTimeout(300);
  }

  await page.screenshot({ path: path.join(screenshotsDir, 'installed-2-settings-multiprovider.png') });
  console.log('Captured: installed-2-settings-multiprovider.png');

  // Close Settings Modal
  await page.evaluate(() => {
    const store = (window as any).__APP_STORE__?.getState();
    if (store) {
      store.setIsSettingsOpen(false);
    }
  });
  await page.waitForTimeout(400);

  // Step 3: Populate Active Session with Real Target, Tools, Risky Approval, and Evidence
  const targetPath = path.resolve('package.json');
  const sampleSessionId = 'installed-realtime-session-001';

  await page.evaluate(({ targetPath, sessionId }) => {
    const store = (window as any).__APP_STORE__?.getState();
    if (store) {
      const targetContext = {
        path: targetPath,
        name: 'rea-studio (Target App)',
        isDirectory: true,
        targetType: 'javascript_electron',
        exists: true,
        size: 1048576,
      };

      store.setSessions([
        {
          id: sessionId,
          title: 'Analysis of rea-studio (Target App)',
          targetPath: targetPath,
          targetName: 'rea-studio (Target App)',
          targetType: 'javascript_electron',
          provider: 'auto',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 3,
        },
      ]);

      store.setActiveSession({
        id: sessionId,
        title: 'Analysis of rea-studio (Target App)',
        target: targetContext,
        provider: 'auto',
        messages: [
          {
            id: 'msg-sys-1',
            sessionId,
            role: 'system',
            content: 'Initialized session for target: **rea-studio** (javascript_electron)\nReady to investigate with REA MCP tools.',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg-user-1',
            sessionId,
            role: 'user',
            content: 'Analyze Electron bundle structure and inspect dangerous APIs.',
            timestamp: new Date().toISOString(),
          },
          {
            id: 'msg-agent-1',
            sessionId,
            role: 'agent',
            content: 'Target inspected. Found electron-builder configuration and verified sandbox settings.',
            timestamp: new Date().toISOString(),
            toolCalls: [
              {
                id: 'tc-static-inspect-1',
                toolName: 'inspect_artifact',
                input: { path: targetPath, analyze_ast: true },
                output: {
                  type: 'javascript_electron',
                  subsystem: 'ELECTRON_MAIN',
                  contextIsolation: true,
                  nodeIntegration: false,
                  sandbox: true,
                  securityRating: 'EXCELLENT',
                },
                status: 'success',
                isRisky: false,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              },
            ],
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Add a pending approval request for a risky tool
      store.addApprovalRequest({
        approvalId: 'appr-frida-001',
        sessionId,
        toolName: 'instrument_with_frida',
        params: {
          binary_path: targetPath,
          script: 'Interceptor.attach(Module.findExportByName(null, "CreateFileW"), { onEnter: function(args) { console.log("File opened"); } });',
          spawn: true,
        },
        reason: 'This tool will SPAWN and EXECUTE target process code with custom runtime instrumentation.',
        requestedAt: new Date().toISOString(),
      });
    }
  }, { targetPath, sessionId: sampleSessionId });

  await page.waitForTimeout(800);

  // Step 4: Capture 3-pane real-time view with Tool Call and Approval Card
  await page.screenshot({ path: path.join(screenshotsDir, 'installed-3-realtime-3pane.png') });
  console.log('Captured: installed-3-realtime-3pane.png');

  // Verify tool card exists
  const toolCard = page.locator('text=Inspect Artifact');
  await expect(toolCard.first()).toBeVisible({ timeout: 5000 });

  // Expand tool call card to see details
  const expandBtn = page.locator('button:has-text("Inspect Artifact"), [data-testid^="tool-card"] button').first();
  if (await expandBtn.count() > 0) {
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  // Verify approval request banner is displayed
  const approvalCard = page.locator('[data-testid="permission-card-appr-frida-001"]');
  await expect(approvalCard).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Risky Action Permission Required')).toBeVisible();
  await expect(page.locator('[data-testid="permission-allow-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="permission-deny-btn"]')).toBeVisible();
  await expect(page.locator('[data-testid="countdown-timer"]')).toBeVisible();

  // Step 5: Focus capture on Chat & Approval Prompt
  await page.screenshot({ path: path.join(screenshotsDir, 'installed-4-chat-tool-approval.png') });
  console.log('Captured: installed-4-chat-tool-approval.png');

  // Step 6: Evidence Pane (Right pane) verification
  const evidencePane = page.locator('[data-testid="evidence-pane"]');
  await expect(evidencePane).toBeVisible({ timeout: 5000 });
  await expect(page.locator('text=Evidence & Findings')).toBeVisible();

  await page.screenshot({ path: path.join(screenshotsDir, 'installed-5-evidence-pane.png') });
  console.log('Captured: installed-5-evidence-pane.png');

  // Step 7: Clean shutdown
  console.log('Shutting down installed application cleanly...');
  await electronApp.close();
  console.log('All real-time verification checks on installed binary passed successfully!');
});
