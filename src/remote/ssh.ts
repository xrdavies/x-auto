import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { XAutoError, type XAutoErrorCode } from '../core/errors.js';

const execFileAsync = promisify(execFile);
export const defaultRemoteHost = process.env.X_AUTO_REMOTE_HOST || '';
export const remoteDir = '~/x-auto';
export const remoteNodeDir = '~/.local/node-v24.15.0-linux-x64/bin';

export const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

export const ssh = async (host: string, command: string) => {
  try {
    return await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', host, command], { maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 255) {
      throw new XAutoError('REMOTE_CONNECTION_FAILED', error instanceof Error ? error.message : String(error));
    }
    const stdout = typeof error === 'object' && error !== null && 'stdout' in error ? String(error.stdout) : '';
    const stderr = typeof error === 'object' && error !== null && 'stderr' in error ? String(error.stderr) : '';
    const output = `${stdout}\n${stderr}`;
    for (const line of output.trim().split('\n').reverse()) {
      try {
        const payload = JSON.parse(line) as { success?: boolean; error?: { code?: string; message?: string; retryable?: boolean; details?: Record<string, unknown> } };
        if (payload.success === false && payload.error?.code && payload.error.message) {
          throw new XAutoError(payload.error.code as XAutoErrorCode, payload.error.message, { retryable: payload.error.retryable, details: payload.error.details });
        }
      } catch (parseError) {
        if (parseError instanceof XAutoError) throw parseError;
      }
    }
    throw new XAutoError('REMOTE_COMMAND_FAILED', stderr.trim() || (error instanceof Error ? error.message : String(error)));
  }
};

export const sshWithInput = async (host: string, command: string, input: string) => new Promise<void>((resolvePromise, reject) => {
  const child = spawn('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', host, command], { stdio: ['pipe', 'inherit', 'inherit'] });
  child.stdin.end(input);
  child.on('error', (error) => reject(new XAutoError('REMOTE_CONNECTION_FAILED', error.message)));
  child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new XAutoError('REMOTE_CONNECTION_FAILED', `remote command exited with code ${code}`)));
});

export const deploy = async (host: string) => {
  const repository = resolve(import.meta.dirname, '../..');
  await ssh(host, `mkdir -p ${remoteDir}`);
  try {
    await execFileAsync('rsync', ['-az', '--exclude', '.git/', '--exclude', 'node_modules/', '--exclude', 'dist/', '--exclude', '.x-auto/', `${repository}/`, `${host}:${remoteDir}/`]);
    await ssh(host, `export PATH=${remoteNodeDir}:$PATH; cd ${remoteDir}; pnpm install --frozen-lockfile; pnpm build`);
  } catch (error) {
    throw new XAutoError('REMOTE_DEPLOY_FAILED', error instanceof Error ? error.message : String(error));
  }
};

const socketFor = (host: string) => resolve(tmpdir(), `x-auto-vnc-${createHash('sha256').update(host).digest('hex').slice(0, 12)}.sock`);

export const startTunnel = async (host: string, port: number) => {
  const socket = socketFor(host);
  if (existsSync(socket)) await unlink(socket);
  await execFileAsync('ssh', ['-M', '-S', socket, '-fN', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-L', `127.0.0.1:${port}:127.0.0.1:${port}`, host]);
  await execFileAsync('open', [`vnc://127.0.0.1:${port}`]);
  return socket;
};

export const stopTunnel = async (host: string) => {
  const socket = socketFor(host);
  if (!existsSync(socket)) return;
  await execFileAsync('ssh', ['-S', socket, '-O', 'exit', host]).catch(() => undefined);
  if (existsSync(socket)) await unlink(socket);
};

export const uploadThreadFile = async (host: string, localPath: string) => {
  if (!existsSync(localPath)) throw new XAutoError('THREAD_INVALID', `Thread 文件不存在：${localPath}`);
  const home = (await ssh(host, 'printf %s "$HOME"')).stdout;
  const remoteDirectory = `${home}/.x-auto/state/uploads`;
  const remotePath = `${remoteDirectory}/thread-${randomUUID()}.jsonl`;
  await ssh(host, `mkdir -p ${shellQuote(remoteDirectory)} && chmod 700 ${shellQuote(remoteDirectory)}`);
  try {
    await execFileAsync('rsync', ['-az', localPath, `${host}:${remotePath}`]);
    await ssh(host, `chmod 600 ${shellQuote(remotePath)}`);
    return remotePath;
  } catch (error) {
    throw new XAutoError('REMOTE_DEPLOY_FAILED', error instanceof Error ? error.message : String(error));
  }
};

export const removeRemoteFile = async (host: string, remotePath: string) => {
  await ssh(host, `if [ -f ${shellQuote(remotePath)} ]; then unlink ${shellQuote(remotePath)}; fi`);
};
