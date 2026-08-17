import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { hashPassword } from './crypto.ts';

function readLineFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const readline = createInterface({
      input: process.stdin,
      crlfDelay: Infinity
    });
    let received = false;
    readline.once('line', line => {
      received = true;
      readline.close();
      resolve(line);
    });
    readline.once('close', () => {
      if (!received) reject(new Error('stdin did not contain a password line'));
    });
  });
}

function readHiddenPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stderr;
    const decoder = new StringDecoder('utf8');
    let password = '';
    let settled = false;

    const cleanup = (): void => {
      input.off('data', onData);
      input.setRawMode?.(false);
      input.pause();
    };
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(password + decoder.end());
    };
    const onData = (chunk: Buffer): void => {
      for (const byte of chunk) {
        if (byte === 3 || byte === 4) {
          output.write('\n');
          finish(new Error('cancelled'));
          return;
        }
        if (byte === 13 || byte === 10) {
          output.write('\n');
          finish();
          return;
        }
        if (byte === 8 || byte === 127) {
          if (password.length > 0) {
            password = password.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        if (byte >= 32) password += decoder.write(Buffer.from([byte]));
      }
    };

    output.write(prompt);
    input.setRawMode?.(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main(): Promise<void> {
  try {
    let password: string;
    if (process.stdin.isTTY) {
      password = await readHiddenPassword('Password: ');
      const confirmation = await readHiddenPassword('Confirm password: ');
      if (password !== confirmation) throw new Error('passwords do not match');
    } else {
      password = await readLineFromStdin();
    }
    const hash = await hashPassword(password);
    process.stdout.write(`${hash}\n`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'password hashing failed';
    console.error(`hash-password failed: ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && basename(process.argv[1]) === 'hash-password.ts')
  void main();
