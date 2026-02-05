import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(repoRoot, 'public', 'docs');

const workerSrcPath = path.join(repoRoot, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.mjs');
// pdfjs expects a URL-like string; on Windows, passing a raw `C:\...` path breaks ESM loading.
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerSrcPath).href;

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

function toThumbPath(pdfPath) {
  const dir = path.dirname(pdfPath);
  const base = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(dir, '.thumbs', `${base}.png`);
}

async function ensureThumb(pdfPath) {
  const outPath = toThumbPath(pdfPath);
  const outDir = path.dirname(outPath);

  await fs.mkdir(outDir, { recursive: true });

  const [pdfStat, outExists] = await Promise.all([fs.stat(pdfPath), fileExists(outPath)]);
  if (outExists) {
    const outStat = await fs.stat(outPath);
    if (outStat.mtimeMs >= pdfStat.mtimeMs) return { pdfPath, outPath, skipped: true };
  }

  const data = await fs.readFile(pdfPath);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data), disableFontFace: true });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);

  const desiredWidth = 640;
  const viewport0 = page.getViewport({ scale: 1 });
  const scale = Math.max(1, desiredWidth / viewport0.width);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  const png = canvas.toBuffer('image/png');
  await fs.writeFile(outPath, png);

  return { pdfPath, outPath, skipped: false };
}

async function main() {
  if (!(await fileExists(docsRoot))) {
    console.log(`[pdf-thumbs] No docs folder at ${docsRoot} (skipping)`);
    return;
  }

  const all = await walk(docsRoot);
  const pdfs = all.filter((f) => f.toLowerCase().endsWith('.pdf'));

  if (!pdfs.length) {
    console.log('[pdf-thumbs] No PDFs found (skipping)');
    return;
  }

  const results = [];
  for (const pdf of pdfs) {
    try {
      results.push(await ensureThumb(pdf));
    } catch (e) {
      console.warn(`[pdf-thumbs] Failed: ${path.relative(repoRoot, pdf)}`);
      console.warn(e?.message ?? e);
    }
  }

  const made = results.filter((r) => r && !r.skipped).length;
  const skipped = results.filter((r) => r && r.skipped).length;
  console.log(`[pdf-thumbs] Done. Generated: ${made}, up-to-date: ${skipped}`);
}

main().catch((e) => {
  console.error('[pdf-thumbs] Fatal error');
  console.error(e);
  process.exit(1);
});
