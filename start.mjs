#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { join } from 'node:path';

import {
  ensureDependencies,
  getRoot,
  parseArgs,
  resolveBin,
  runBuild,
  setupCleanup,
} from './start-helper.mjs';

const LOG_PREFIX = '[gcos-rive-test]';
const root = getRoot();
process.chdir(root);

let parsedArgs;
try {
  parsedArgs = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(`${LOG_PREFIX} ${error.message}`);
  process.exit(1);
}
const { skipInstall, skipBuild, forward } = parsedArgs;

ensureDependencies(root, skipInstall);
if (!skipBuild) runBuild(root);

const children = new Set();
const { cleanup, registerSignals } = setupCleanup(children);
registerSignals();

const gcosStart = resolveBin(root, 'gcos-start');
console.log(`${LOG_PREFIX} gcos-start ${forward.join(' ')}`);

const appServer = spawn(process.execPath, [gcosStart, ...forward], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe'],
});
children.add(appServer);

let appServerStdoutBuffer = '';
let reporter = null;

appServer.stdout.on('data', (data) => {
  process.stdout.write(data);
  const combinedStdout = `${appServerStdoutBuffer}${data.toString()}`;
  appServerStdoutBuffer = combinedStdout.slice(-4096);

  if (!reporter && combinedStdout.includes('App Server started')) {
    reporter = spawn(process.execPath, [join(root, 'report-ready.js')], {
      cwd: root,
      stdio: 'inherit',
    });
    children.add(reporter);

    reporter.on('close', (code) => {
      children.delete(reporter);
      if (code) console.error(`${LOG_PREFIX} report-ready.js exited with code ${code}`);
    });
  }
});

appServer.stderr.on('data', (data) => {
  process.stderr.write(data);
});

appServer.on('close', (code) => {
  children.delete(appServer);
  cleanup();
  process.exit(code ?? 0);
});
