#!/usr/bin/env node
// Exports the homepage hero animation (HeroPlannerAnimation) as an mp4 + GIF,
// captured from a live, code-driven render — not a manual screen recording.
//
// How it works:
//   1. Ensures the Vite dev server is running (starts one if needed).
//   2. Opens /capture-hero (a dev-only route rendering just the animation,
//      centered on a fixed 1280x720 canvas) in headless Chromium via
//      Playwright, with video recording enabled on the browser context.
//   3. Waits for the animation's own loop-cycle counter (exposed as a DOM
//      data-attribute) to tick over — i.e. one full loop has played —
//      instead of guessing a duration. Resilient to future timing tweaks in
//      HeroPlannerAnimation.tsx.
//   4. Closes the context (finalizing the .webm) and converts it with ffmpeg
//      into a web-ready .mp4 (LinkedIn/Twitter) and an optimized .gif
//      (palette-generated, for README/GitHub embeds).
//
// One-time setup: npx playwright install chromium
// Requires ffmpeg on PATH.
//
// Usage: node scripts/capture-hero.mjs

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'marketing-export');
const DEV_URL = 'http://localhost:5173';
const CAPTURE_URL = `${DEV_URL}/capture-hero`;

const VIEWPORT = { width: 1280, height: 720 };

function log(msg) {
  console.log(`[capture-hero] ${msg}`);
}

async function isServerUp() {
  try {
    const res = await fetch(DEV_URL);
    return true; // any response (even 404) means something is listening
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp()) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function killTree(proc) {
  if (!proc) return;
  if (process.platform === 'win32') {
    // proc.kill() alone often leaves the real vite/node process running as an
    // orphan on Windows when spawned with shell:true (it only kills cmd.exe).
    spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    proc.kill('SIGTERM');
  }
}

async function ensureDevServer() {
  if (await isServerUp()) {
    log('Dev server already running — reusing it.');
    return { proc: null };
  }
  log('Starting Vite dev server...');
  const proc = spawn('npm', ['run', 'dev', '--', '--port', '5173', '--strictPort'], {
    cwd: ROOT,
    stdio: 'ignore',
    shell: true,
  });
  const up = await waitForServer(30000);
  if (!up) {
    killTree(proc);
    throw new Error('Dev server did not start within 30s.');
  }
  log('Dev server ready.');
  return { proc };
}

async function captureVideo() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  // Video recording begins the instant the context is created — but on a dev
  // server's very first request, Vite has to cold-compile the whole module
  // graph (framer-motion, icons, etc.), which can take several real seconds.
  // That shows up as dead/blank time at the head of the recording. Rather than
  // trim a guessed amount, measure it: t0 is "recording started", t1 is "the
  // animation actually mounted" (its DOM marker first appears). The gap
  // between them is cut precisely with ffmpeg below.
  const t0 = Date.now();
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT_DIR, size: VIEWPORT },
  });
  const page = await context.newPage();

  log(`Opening ${CAPTURE_URL} ...`);
  await page.goto(CAPTURE_URL, { waitUntil: 'networkidle' });

  await page.waitForSelector('[data-hero-cycle]');
  const leadInSeconds = (Date.now() - t0) / 1000;
  log(`Animation mounted after ${leadInSeconds.toFixed(2)}s lead-in (will be trimmed).`);

  log('Waiting for one full animation loop to complete...');
  await page.waitForFunction(
    () => document.querySelector('[data-hero-cycle]')?.getAttribute('data-hero-cycle') === '1',
    { timeout: 20000 }
  );
  // The loop boundary is a soft crossfade (fade-out then fade-back-in), not a
  // hard cut — hold a beat so the recording ends mid-fade-in, which makes the
  // clip loop smoothly when a platform/GIF viewer repeats it.
  await page.waitForTimeout(600);

  const video = page.video();
  await context.close();
  await browser.close();

  const videoPath = await video.path();
  const finalPath = path.join(OUT_DIR, 'hero-capture.webm');
  renameSync(videoPath, finalPath);
  log(`Captured: ${finalPath}`);
  return { webmPath: finalPath, leadInSeconds };
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))));
  });
}

async function convert(webmPath, leadInSeconds) {
  const mp4Path = path.join(OUT_DIR, 'hero.mp4');
  const gifPath = path.join(OUT_DIR, 'hero.gif');
  const palettePath = path.join(OUT_DIR, 'palette.png');
  // Small safety margin so we don't clip the very first typed character.
  const seek = Math.max(0, leadInSeconds - 0.15).toFixed(2);
  const seekArgs = ['-ss', seek];

  log(`Encoding hero.mp4 (H.264, web-ready, trimmed ${seek}s lead-in)...`);
  await run('ffmpeg', [
    '-y', ...seekArgs, '-i', webmPath,
    '-vf', 'fps=30',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    mp4Path,
  ]);

  log('Generating GIF color palette...');
  await run('ffmpeg', [
    '-y', ...seekArgs, '-i', webmPath,
    '-vf', 'fps=15,scale=800:-2:flags=lanczos,palettegen=stats_mode=diff',
    palettePath,
  ]);

  log('Encoding hero.gif (palette-optimized)...');
  await run('ffmpeg', [
    '-y', ...seekArgs, '-i', webmPath, '-i', palettePath,
    '-filter_complex',
    'fps=15,scale=800:-2:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle',
    gifPath,
  ]);

  rmSync(palettePath, { force: true });
  log('Done:');
  log(`  ${mp4Path}`);
  log(`  ${gifPath}`);
}

async function main() {
  const { proc } = await ensureDevServer();
  try {
    const { webmPath, leadInSeconds } = await captureVideo();
    await convert(webmPath, leadInSeconds);
  } finally {
    if (proc) {
      log('Stopping the dev server this script started...');
      killTree(proc);
    }
  }
}

main().catch((err) => {
  console.error('[capture-hero] Failed:', err);
  process.exit(1);
});
