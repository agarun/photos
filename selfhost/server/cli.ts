import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadConfig } from './config.ts';
import { startServer } from './index.ts';

export function cliConfigPath(args: string[]): string {
  let configPath = './config.json';
  let hasConfigArgument = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== '--config') {
      throw new Error('Usage: node selfhost/server.ts --config <path>');
    }
    if (hasConfigArgument || args[index + 1] === undefined) {
      throw new Error('Usage: node selfhost/server.ts --config <path>');
    }
    hasConfigArgument = true;
    configPath = args[index + 1];
    index += 1;
  }
  return resolve(process.cwd(), configPath);
}

export async function runCli(): Promise<void> {
  const config = loadConfig(cliConfigPath(process.argv.slice(2)));
  const running = await startServer(config);
  console.log(
    `Private album server listening on ${config.host}:${running.port}`
  );
  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    void running.close().then(
      () => process.exit(0),
      () => process.exit(1)
    );
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

export function isMainModule(filename: string): boolean {
  if (process.argv[1] === undefined) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(filename);
  } catch {
    return false;
  }
}
