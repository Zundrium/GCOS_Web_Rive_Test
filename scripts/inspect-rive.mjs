#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DataEnum,
  RiveFile,
  RuntimeLoader,
  StateMachineInputType,
  ViewModel,
} = require('@rive-app/webgl2');

// The web runtime expects browser image APIs when a .riv contains image assets.
// The inspector only needs metadata, so a tiny stub is enough while assetLoader
// below declines asset decoding.
if (typeof globalThis.Image === 'undefined') {
  globalThis.Image = class ImageStub {
    set src(_value) {
      queueMicrotask(() => this.onload?.());
    }
  };
}

const cwd = process.cwd();
const args = process.argv.slice(2);
const json = takeFlag(args, '--json');
const help = takeFlag(args, '--help') || takeFlag(args, '-h');

if (help) {
  printHelp();
  process.exit(0);
}

const targets = args.length > 0
  ? expandTargets(args)
  : expandTargets(['apps/operator/public', 'apps/interactive/public']);

if (targets.length === 0) {
  console.error('No .riv files found. Pass one or more files/directories, or place files under apps/*/public/.');
  process.exit(1);
}

const wasmPath = require.resolve('@rive-app/webgl2/rive.wasm');
const wasmBytes = fs.readFileSync(wasmPath);
RuntimeLoader.wasmBinary = wasmBytes.buffer.slice(
  wasmBytes.byteOffset,
  wasmBytes.byteOffset + wasmBytes.byteLength,
);

const results = [];
for (const filePath of targets) {
  try {
    results.push(await inspectRiveFile(filePath));
  } catch (error) {
    results.push({
      file: path.relative(cwd, filePath),
      error: error?.message ?? String(error),
    });
  }
}

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else {
  printText(results);
}

function takeFlag(values, flag) {
  const index = values.indexOf(flag);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
}

function printHelp() {
  console.log(`Usage:
  npm run inspect:rive
  npm run inspect:rive -- apps/interactive/public/file.riv
  npm run inspect:rive:json -- apps/interactive/public

Inspects .riv metadata relevant for GCOS mappings:
  - artboards
  - animations
  - state machines
  - state machine inputs: trigger / boolean / number
  - view model data-binding properties and data enums

With no paths, scans apps/operator/public and apps/interactive/public.`);
}

function expandTargets(inputPaths) {
  const files = [];
  for (const inputPath of inputPaths) {
    const absolute = path.resolve(cwd, inputPath);
    if (!fs.existsSync(absolute)) continue;

    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...findRiveFiles(absolute));
    } else if (stat.isFile() && absolute.toLowerCase().endsWith('.riv')) {
      files.push(absolute);
    }
  }

  return [...new Set(files)].sort((a, b) => a.localeCompare(b));
}

function findRiveFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRiveFiles(absolute));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.riv')) {
      files.push(absolute);
    }
  }
  return files;
}

async function inspectRiveFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  const skippedAssets = [];
  const riveFile = new RiveFile({
    buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    enableRiveAssetCDN: false,
    assetLoader: (asset, assetBytes) => {
      skippedAssets.push({
        name: asset?.name ?? '(unnamed asset)',
        bytes: assetBytes?.byteLength ?? 0,
      });
      return false;
    },
  });

  await riveFile.init();

  try {
    const file = riveFile.getInstance();
    return {
      file: path.relative(cwd, filePath),
      artboards: inspectArtboards(file, riveFile.runtime),
      viewModels: inspectViewModels(file),
      enums: inspectEnums(file),
      skippedAssets,
    };
  } finally {
    riveFile.cleanup();
  }
}

function inspectArtboards(file, runtime) {
  const artboards = [];
  const count = safeNumber(() => file.artboardCount());

  for (let i = 0; i < count; i += 1) {
    const artboard = file.artboardByIndex(i);
    const artboardName = artboard.name;
    const animations = [];
    const animationCount = safeNumber(() => artboard.animationCount());
    for (let j = 0; j < animationCount; j += 1) {
      animations.push(artboard.animationByIndex(j).name);
    }

    const stateMachines = [];
    const stateMachineCount = safeNumber(() => artboard.stateMachineCount());
    for (let j = 0; j < stateMachineCount; j += 1) {
      const stateMachine = artboard.stateMachineByIndex(j);
      const instance = new runtime.StateMachineInstance(stateMachine, artboard);
      const inputs = [];
      const inputCount = safeNumber(() => instance.inputCount());

      for (let k = 0; k < inputCount; k += 1) {
        const input = instance.input(k);
        const item = {
          name: input.name,
          type: inputTypeName(input.type),
        };
        if (input.value !== undefined) item.initialValue = input.value;
        inputs.push(item);
      }

      instance.delete?.();
      stateMachines.push({ name: stateMachine.name, inputs });
    }

    artboard.delete?.();
    artboards.push({ name: artboardName, animations, stateMachines });
  }

  return artboards;
}

function inspectViewModels(file) {
  const viewModels = [];
  const count = safeNumber(() => file.viewModelCount?.() ?? 0);

  for (let i = 0; i < count; i += 1) {
    const nativeViewModel = file.viewModelByIndex(i);
    const viewModel = new ViewModel(nativeViewModel);
    viewModels.push({
      name: viewModel.name,
      instanceNames: viewModel.instanceNames ?? [],
      properties: (viewModel.properties ?? []).map((property) => ({
        name: property.name,
        type: property.type,
      })),
    });
  }

  return viewModels;
}

function inspectEnums(file) {
  const nativeEnums = typeof file.enums === 'function' ? file.enums() : [];
  return nativeEnums.map((nativeEnum) => {
    const dataEnum = new DataEnum(nativeEnum);
    return {
      name: dataEnum.name,
      values: dataEnum.values,
    };
  });
}

function safeNumber(read) {
  const value = read();
  return Number.isFinite(value) ? value : 0;
}

function inputTypeName(type) {
  const name = StateMachineInputType[type] ?? type;
  return String(name).toLowerCase();
}

function printText(results) {
  for (const result of results) {
    console.log(`\n${result.file}`);
    console.log('='.repeat(result.file.length));

    if (result.error) {
      console.log(`Error: ${result.error}`);
      continue;
    }

    if (result.artboards.length === 0) console.log('No artboards found.');

    for (const artboard of result.artboards) {
      console.log(`\nArtboard: ${artboard.name}`);

      if (artboard.animations.length > 0) {
        console.log('  Animations:');
        for (const animation of artboard.animations) console.log(`    - ${animation}`);
      }

      if (artboard.stateMachines.length > 0) {
        console.log('  State machines:');
        for (const stateMachine of artboard.stateMachines) {
          console.log(`    - ${stateMachine.name}`);
          if (stateMachine.inputs.length === 0) {
            console.log('      inputs: none');
          } else {
            for (const input of stateMachine.inputs) {
              const initial = input.initialValue === undefined ? '' : ` initial=${input.initialValue}`;
              console.log(`      - ${input.name} [${input.type}]${initial}`);
            }
          }
        }
      }
    }

    if (result.viewModels.length > 0) {
      console.log('\nView models / data binding:');
      for (const viewModel of result.viewModels) {
        console.log(`  - ${viewModel.name}`);
        if (viewModel.instanceNames.length > 0) {
          console.log(`    instances: ${viewModel.instanceNames.join(', ')}`);
        }
        for (const property of viewModel.properties) {
          console.log(`    - ${property.name} [${property.type}]`);
        }
      }
    }

    if (result.enums.length > 0) {
      console.log('\nData enums:');
      for (const dataEnum of result.enums) {
        console.log(`  - ${dataEnum.name}: ${dataEnum.values.join(', ')}`);
      }
    }

    if (result.skippedAssets.length > 0) {
      const totalBytes = result.skippedAssets.reduce((sum, asset) => sum + asset.bytes, 0);
      console.log(`\nSkipped ${result.skippedAssets.length} embedded asset(s) while inspecting metadata (${formatBytes(totalBytes)}).`);
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
