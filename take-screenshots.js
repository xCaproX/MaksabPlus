import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 5195;

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
  return new Promise((resolve) => {
    if (fs.existsSync(outputPath)) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    const args = [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      targetUrl,
    ];
    const proc = spawn(edgePath, args);
    proc.on('close', async () => {
      // Wait for Edge worker to write the file
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

  const targetUrl = `http://localhost:${port}/preview-phase3-4`;
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

  const shot1280 = path.join(outDir, 'phase3-4-verification-1280px.png');
  const shot1920 = path.join(outDir, 'phase3-4-verification-1920px.png');

  console.log('Taking 1280px screenshot of Phase 3 & 4...');
  await runEdgeScreenshot(1280, 920, shot1280, targetUrl);
  console.log('Saved 1280px exists:', fs.existsSync(shot1280));

  console.log('Taking 1920px screenshot of Phase 3 & 4...');
  await runEdgeScreenshot(1920, 1080, shot1920, targetUrl);
  console.log('Saved 1920px exists:', fs.existsSync(shot1920));

  // Phase 1: Showcase route /dev/components
  const phase1Dir = path.join(outDir, 'phase1');
  if (!fs.existsSync(phase1Dir)) fs.mkdirSync(phase1Dir, { recursive: true });

  const devUrl = `http://localhost:${port}/dev/components`;
  const devShot1280 = path.join(phase1Dir, 'dev-components-1280px.png');
  const devShot1920 = path.join(phase1Dir, 'dev-components-1920px.png');

  console.log('Taking 1280px screenshot of /dev/components...');
  await runEdgeScreenshot(1280, 1200, devShot1280, devUrl);
  console.log('Saved dev 1280px exists:', fs.existsSync(devShot1280));

  console.log('Taking 1920px screenshot of /dev/components...');
  await runEdgeScreenshot(1920, 1200, devShot1920, devUrl);
  console.log('Saved dev 1920px exists:', fs.existsSync(devShot1920));

  // Copy to artifact directory
  const artifactDir = path.resolve('C:\\Users\\cfcap\\.gemini\\antigravity\\brain\\16a0f386-8c08-4f7f-ad2b-d742683beb9d');
  if (fs.existsSync(artifactDir)) {
    if (fs.existsSync(shot1280)) {
      fs.copyFileSync(shot1280, path.join(artifactDir, 'phase3-4-verification-1280px.png'));
    }
    if (fs.existsSync(shot1920)) {
      fs.copyFileSync(shot1920, path.join(artifactDir, 'phase3-4-verification-1920px.png'));
    }
    if (fs.existsSync(devShot1280)) {
      fs.copyFileSync(devShot1280, path.join(artifactDir, 'dev-components-1280px.png'));
    }
    if (fs.existsSync(devShot1920)) {
      fs.copyFileSync(devShot1920, path.join(artifactDir, 'dev-components-1920px.png'));
    }
    console.log('Copied screenshots to artifact directory:', artifactDir);
  }

  console.log('Cleaning up server...');
  vite.kill('SIGTERM');
  spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t']);
  console.log('Done!');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
