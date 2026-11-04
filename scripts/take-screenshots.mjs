import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Starting in-process Vite server...');
  const server = await createServer({
    server: { port: 5188 },
  });
  await server.listen();
  console.log('Vite server running on http://localhost:5188');

  try {
    const browser = await chromium.launch({
      executablePath: edgePath,
      headless: true,
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // 1920px screenshot
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('http://localhost:5188/preview-phase3-4', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'public/screenshots/kpi-bar-1920px.png', fullPage: false });
    console.log('Saved public/screenshots/kpi-bar-1920px.png');

    // 1280px screenshot
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5188/preview-phase3-4', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'public/screenshots/kpi-bar-1280px.png', fullPage: false });
    console.log('Saved public/screenshots/kpi-bar-1280px.png');

    await browser.close();
  } finally {
    await server.close();
  }
}

main().catch(console.error);
