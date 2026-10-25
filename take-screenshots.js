import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 5197;

function checkUrl(url) {
  return new Promise((resolve) => {
    http
      .get(url, (res) => {
        resolve(res.statusCode === 200);
      })
      .on('error', () => {
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
  return new Promise((resolve) => {
    if (fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch {}
    }
    const tempProfile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `edge_shot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    const args = [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${tempProfile}`,
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      targetUrl,
    ];
    const proc = spawn(edgePath, args);
    proc.on('close', async () => {
      for (let i = 0; i < 20; i++) {
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1000) {
          resolve(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      resolve(fs.existsSync(outputPath));
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

  const phaseUrl = `http://localhost:${port}/preview-phase3-4`;
  const invoiceUrl = `http://localhost:${port}/preview-invoice`;

  const ready = await waitForServer(phaseUrl);
  if (!ready) {
    console.error('Server did not become ready in time');
    vite.kill();
    process.exit(1);
  }

  console.log('Server is ready. Giving a moment for React hydration...');
  await new Promise((r) => setTimeout(r, 3500));

  const outDir = path.resolve('public', 'screenshots');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const tasks = [
    { name: 'ui-modernized-1280px.png', w: 1280, h: 920, url: phaseUrl },
    { name: 'ui-modernized-1920px.png', w: 1920, h: 1080, url: phaseUrl },
    { name: 'ui-modernized-600px.png', w: 600, h: 960, url: phaseUrl },
    { name: 'invoice-form-1280px.png', w: 1280, h: 920, url: invoiceUrl },
    { name: 'invoice-form-600px.png', w: 600, h: 960, url: invoiceUrl },
  ];

  const artifactDir = path.resolve(
    'C:\\Users\\cfcap\\.gemini\\antigravity\\brain\\c39402ce-365e-4a3f-9835-a6507764ea65'
  );

  for (const t of tasks) {
    const shotPath = path.join(outDir, t.name);
    console.log(`Taking ${t.name} (${t.w}x${t.h})...`);
    await runEdgeScreenshot(t.w, t.h, shotPath, t.url);
    const ok = fs.existsSync(shotPath);
    console.log(`Saved ${t.name}:`, ok);
    if (ok && fs.existsSync(artifactDir)) {
      fs.copyFileSync(shotPath, path.join(artifactDir, t.name));
    }
  }

  console.log('Cleaning up server...');
  vite.kill('SIGTERM');
  spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t']);
  console.log('Done taking all screenshots!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
