// Keeps images in public/assets/ small enough for the web.
//
//   npm run images            shrink oversized photos in place (also runs before every build)
//   npm run images -- --thumbs  only (re)make the small previews used by cards
//
// Shrinking: anything wider than 2000 px or bigger than 600 KB is resized and recompressed.
// Large PNG photos (no transparency) become .jpg, and every reference to them in src/ is updated.
// Previews: project thumbnails, journey photos and public/assets/images/* get a 720 px .webp copy
// in public/thumbs/ (generated, not committed).

import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const PUBLIC = 'public';
const MAX_WIDTH = 2000;
const MAX_BYTES = 600 * 1024;
const THUMB_WIDTH = 720;
const thumbsOnly = process.argv.includes('--thumbs');

// Read files into memory first: on Windows sharp would otherwise keep the file locked.
sharp.cache(false);
const load = (f) => sharp(readFileSync(f), { failOn: 'none' });

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]
  );
const isImage = (f) => /\.(jpe?g|png)$/i.test(f);
const toUrl = (f) => '/' + path.relative(PUBLIC, f).split(path.sep).join('/');
const kb = (n) => `${Math.round(n / 1024)} KB`;

// Point every reference in src/ at a renamed file.
function updateReferences(from, to) {
  for (const f of walk('src').filter((f) => /\.(mdx?|ya?ml|astro|ts)$/.test(f))) {
    let text = readFileSync(f, 'utf8');
    const before = text;
    text = text.split(from).join(to).split(encodeURI(from)).join(encodeURI(to));
    if (text !== before) {
      writeFileSync(f, text);
      console.log(`  updated references in ${f}`);
    }
  }
}

// ---------- 1. shrink oversized images ----------
if (!thumbsOnly) {
  // Skip generated previews (.thumbs folders are made by generate-pdf-thumbs).
  for (const file of walk(path.join(PUBLIC, 'assets')).filter((f) => isImage(f) && !f.includes(`${path.sep}.thumbs${path.sep}`))) {
    const before = statSync(file).size;
    const img = load(file).rotate();
    const meta = await img.metadata();
    if ((meta.width ?? 0) <= MAX_WIDTH && before <= MAX_BYTES) continue;

    const resized = img.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    const isPng = /\.png$/i.test(file);
    const opaque = isPng ? (await load(file).stats()).isOpaque : true;

    let out = file;
    let data;
    if (isPng && opaque) {
      out = file.replace(/\.png$/i, '.jpg');
      data = await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    } else if (isPng) {
      data = await resized.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
    } else {
      data = await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    }
    // Only rewrite when it really helps; recompressing a JPEG again and again loses quality.
    if (data.length > before * 0.9 && out === file) continue;
    if (out !== file && existsSync(out)) {
      console.warn(`skip ${file}: ${out} already exists`);
      continue;
    }

    writeFileSync(out, data);
    if (out !== file) {
      unlinkSync(file);
      updateReferences(toUrl(file), toUrl(out));
    }
    console.log(`${toUrl(out)}: ${kb(before)} -> ${kb(data.length)}`);
  }
}

// ---------- 2. small previews ----------
const wanted = new Set();
for (const f of walk('src/content/projects')) {
  const m = readFileSync(f, 'utf8').match(/^thumbnail:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (m) wanted.add(m[1].trim());
}
const journey = 'src/data/journey.yaml';
if (existsSync(journey)) {
  for (const m of readFileSync(journey, 'utf8').matchAll(/^\s*-\s*(\/assets\/\S+\.(?:jpe?g|png))\s*$/gim)) wanted.add(m[1]);
}
for (const f of walk(path.join(PUBLIC, 'assets', 'images')).filter(isImage)) wanted.add(toUrl(f));

let made = 0;
for (const url of wanted) {
  const src = path.join(PUBLIC, decodeURI(url));
  if (!existsSync(src)) continue;
  const dest = path.join(PUBLIC, 'thumbs', decodeURI(url).replace(/\.[^.]+$/, '.webp'));
  if (existsSync(dest) && statSync(dest).mtimeMs >= statSync(src).mtimeMs) continue;
  mkdirSync(path.dirname(dest), { recursive: true });
  await load(src).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toFile(dest);
  made++;
}
console.log(`previews: ${made} made, ${wanted.size} total`);
