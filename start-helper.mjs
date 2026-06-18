import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOG_PREFIX = '[gcos-rive-test]';

export function getRoot() {
  return dirname(fileURLToPath(import.meta.url));
}

export function parseArgs(argv) {
  const skipInstall = argv.includes('--skip-install');
  const skipBuild = argv.includes('--skip-build');
  const forward = argv.filter((a) => a !== '--skip-install' && a !== '--skip-build');

  const barePortIndex = forward.findIndex((a) => a === '--port');
  if (
    barePortIndex !== -1 &&
    (barePortIndex + 1 >= forward.length || forward[barePortIndex + 1].startsWith('--'))
  ) {
    throw new Error('Missing value for --port. Use --port 8101 or --port=8101.');
  }

  const hasPort = forward.some((a) => a.startsWith('--port=')) || barePortIndex !== -1;
  if (!hasPort) forward.push('--port', '8101');

  return { skipInstall, skipBuild, forward };
}

export function resolveBin(root, binName) {
  return join(root, 'node_modules', '@gcos', 'app-server', 'bin', `${binName}.mjs`);
}

export function ensureDependencies(root, skipInstall) {
  if (skipInstall) return;

  const roots = ['.', 'apps/operator', 'apps/interactive'];
  const missing = roots.filter((r) => !existsSync(join(root, r, 'node_modules')));

  if (missing.length === 0) return;

  console.log(`${LOG_PREFIX} Missing dependencies in: ${missing.join(', ')}`);
  console.log(`${LOG_PREFIX} npm run install:all`);
  execSync('npm run install:all', { cwd: root, stdio: 'inherit', shell: true });
}

export function runBuild(root) {
  console.log(`${LOG_PREFIX} npm run build`);
  execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });
}

export function setupCleanup(children) {
  let shuttingDown = false;

  function cleanup(signal = 'SIGTERM') {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) {
      if (!child.killed) child.kill(signal);
    }
  }

  function registerSignals() {
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.once(sig, () => cleanup(sig));
    }
  }

  return { cleanup, registerSignals };
}
