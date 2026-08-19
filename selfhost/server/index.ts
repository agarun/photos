import { createServer } from 'node:http';

import { validateConfig, loadConfig } from './config.ts';
import {
  SERVER_HEADERS_TIMEOUT_MS,
  SERVER_KEEP_ALIVE_TIMEOUT_MS,
  SERVER_REQUEST_TIMEOUT_MS
} from './constants.ts';
import { handleRequest } from './request.ts';
import { createRuntime } from './runtime.ts';
import type { RunningServer } from './model.ts';
import type { ServerConfig } from '../types.ts';

export { loadConfig, validateConfig } from './config.ts';
export type { RunningServer } from './model.ts';

export async function startServer(input: ServerConfig): Promise<RunningServer> {
  const config = validateConfig(input);
  const runtime = await createRuntime(config);
  const server = createServer((req, res) => {
    void handleRequest(req, res, runtime);
  });
  server.requestTimeout = SERVER_REQUEST_TIMEOUT_MS;
  server.headersTimeout = SERVER_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = SERVER_KEEP_ALIVE_TIMEOUT_MS;

  await new Promise<void>((resolvePromise, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.host);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    await new Promise<void>(resolvePromise =>
      server.close(() => resolvePromise())
    );
    throw new Error('Unable to determine the listening port.');
  }
  const port = address.port;
  const close = (): Promise<void> =>
    new Promise((resolvePromise, reject) => {
      if (!server.listening) {
        resolvePromise();
        return;
      }
      server.close(error => (error ? reject(error) : resolvePromise()));
    });
  return { server, port, close };
}
