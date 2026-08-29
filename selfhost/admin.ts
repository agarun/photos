import { basename } from 'node:path';

import { loadAdminModel, startAdminServer } from './server/admin-server.ts';

const DEFAULT_PORT = 4173;

function usage(): string {
  return 'Usage: node selfhost/admin.ts <source-dir> [--preview-dir <dir>] [--port <port>]';
}

function parsePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('--port must be an integer between 0 and 65535');
  }
  return port;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let sourceDir: string | undefined;
  let previewDir: string | undefined;
  let port: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      console.log(usage());
      return;
    }
    if (argument === '--port') {
      index += 1;
      port = parsePort(argv[index]);
      continue;
    }
    if (argument === '--preview-dir') {
      index += 1;
      previewDir = argv[index];
      if (previewDir === undefined) throw new Error('--preview-dir needs a directory');
      continue;
    }
    if (argument.startsWith('--preview-dir=')) {
      previewDir = argument.slice('--preview-dir='.length);
      if (previewDir.length === 0) throw new Error('--preview-dir needs a directory');
      continue;
    }
    if (argument.startsWith('--port=')) {
      port = parsePort(argument.slice('--port='.length));
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`unknown option ${argument}`);
    }
    if (sourceDir !== undefined)
      throw new Error(`${usage()}\nToo many arguments.`);
    sourceDir = argument;
  }
  if (sourceDir === undefined) {
    throw new Error(`${usage()}\nMissing source directory.`);
  }

  const model = await loadAdminModel(sourceDir, { previewDir });
  const running = await startAdminServer(model, port ?? DEFAULT_PORT);
  const photoCount = model.photos.length;
  console.log(`Album admin for ${model.title}`);
  console.log(
    `${photoCount} photo${photoCount === 1 ? '' : 's'} found in ${model.sourceDir}`
  );
  console.log(
    `Open http://127.0.0.1:${running.port}/ to reorder and favorite.`
  );
  console.log(`Changes are saved to ${model.sidecarPath}`);
  if (previewDir !== undefined) {
    console.log(
      `${model.previewPathBySourcePath.size} WebP preview${model.previewPathBySourcePath.size === 1 ? '' : 's'} loaded from ${previewDir}`
    );
  }
  console.log('Press Ctrl+C to stop.');
}

if (process.argv[1] && basename(process.argv[1]) === 'admin.ts') {
  void main().catch(error => {
    const message =
      error instanceof Error ? error.message : 'admin server failed';
    console.error(`admin failed: ${message}`);
    process.exitCode = 1;
  });
}
