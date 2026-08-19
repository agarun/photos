import { isMainModule, runCli } from './server/cli.ts';

export { loadConfig, startServer, validateConfig } from './server/index.ts';
export type { RunningServer } from './server/model.ts';

if (isMainModule(import.meta.filename)) {
  void runCli().catch(error => {
    const message =
      error instanceof Error ? error.message : 'Server startup failed.';
    console.error(message);
    process.exitCode = 1;
  });
}
