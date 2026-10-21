// Copies the web app into www/, the folder Capacitor packages into the phone apps.
import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const out = join(root, 'www');
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'fonts'];

await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const f of files) await cp(join(root, f), join(out, f), { recursive: true });
console.log(`Copied ${files.length} entries to www/`);
