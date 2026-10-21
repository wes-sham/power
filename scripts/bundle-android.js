// Builds the signed Android App Bundle (.aab) to upload to Google Play.
// Needs the Android SDK (installed with Android Studio) and android/keystore.properties.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const android = join(root, 'android');
if (!existsSync(join(android, 'keystore.properties'))) {
  console.error('Missing android/keystore.properties: copy keystore.properties.example and fill in your upload key.');
  process.exit(1);
}
const win = process.platform === 'win32';
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: win });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npm', ['run', 'sync'], root);
run(win ? 'gradlew.bat' : './gradlew', ['bundleRelease'], android);
console.log('\nUpload this file to Google Play:\n  android/app/build/outputs/bundle/release/app-release.aab');
