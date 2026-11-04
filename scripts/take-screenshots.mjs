import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  const outDir = path.resolve('docs/screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

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
    await page.goto('http://localhost:5188/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, 'app-1920px.png'), fullPage: false });
    console.log('Saved docs/screenshots/app-1920px.png');

    // 1280px screenshot
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5188/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(outDir, 'app-1280px.png'), fullPage: false });
    console.log('Saved docs/screenshots/app-1280px.png');

    await browser.close();
  } finally {
    await server.close();
  }
}

main().catch(console.error);
