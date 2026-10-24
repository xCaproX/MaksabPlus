import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 5199;

function checkUrl(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => {
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await checkUrl(url);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function runEdgeScreenshot(width, height, outputPath, targetUrl) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      targetUrl,
    ];
    const proc = spawn(edgePath, args);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Edge exited with code ${code}`));
    });
  });
}

async function main() {
  console.log('Starting vite server on port', port);
  const vite = spawn('npx.cmd', ['vite', '--port', String(port), '--strictPort'], {
    shell: true,
    stdio: 'pipe',
  });

  vite.stdout.on('data', (d) => console.log('vite:', d.toString().trim()));
  vite.stderr.on('data', (d) => console.error('vite err:', d.toString().trim()));

  const targetUrl = `http://localhost:${port}/preview-receipt`;
  const ready = await waitForServer(targetUrl);
  if (!ready) {
    console.error('Server did not become ready in time');
    vite.kill();
    process.exit(1);
  }

  console.log('Server is ready. Giving a moment for React hydration...');
  await new Promise((r) => setTimeout(r, 3500));

  const outDir = path.resolve('public', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const shot1280 = path.join(outDir, 'phase2-receipt-modal-1280px.png');
  const shot1920 = path.join(outDir, 'phase2-receipt-modal-1920px.png');

  console.log('Taking 1280px screenshot of receipt modal...');
  await runEdgeScreenshot(1280, 920, shot1280, targetUrl);
  console.log('Saved:', shot1280);

  console.log('Taking 1920px screenshot of receipt modal...');
  await runEdgeScreenshot(1920, 1080, shot1920, targetUrl);
  console.log('Saved:', shot1920);

  console.log('Cleaning up server...');
  vite.kill('SIGTERM');
  spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t']);
  console.log('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
