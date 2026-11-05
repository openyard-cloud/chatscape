// Builds dist/chatscape first, so the tests run the files people install.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export default function globalSetup() {
  if (process.env['CHATSCAPE_EXTENSION']) return; // testing a given build as it is
  execFileSync('sh', ['scripts/build.sh'], { cwd: path.resolve(__dirname, '../..'), stdio: 'inherit' });
}
