import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Electron app smoke test: launches window and verifies shell', async () => {
  const electronApp = await electron.launch({
    args: [path.join(import.meta.dirname, '../../dist-electron/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  });

  const window = await electronApp.firstWindow();
  expect(window).toBeTruthy();

  const title = await window.title();
  expect(title).toBe('REA Studio');

  await electronApp.close();
});
