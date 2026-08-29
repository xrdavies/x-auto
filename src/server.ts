#!/usr/bin/env node

import { createServer } from 'node:http';
import { chmod, mkdir, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';

import { comment, like, quote, retweet } from './actions/interactions.js';
import { post } from './actions/post.js';
import { threadPosts } from './actions/thread.js';
import { checkSession } from './browser/session.js';
import { serializeError, XAutoError } from './core/errors.js';
import { recordAction } from './core/logs.js';
import { requireAvailableSelectedProfile, requireSelectedProfile, type ProfileSelection } from './core/profiles.js';

type ServerOptions = ProfileSelection & { handle: string; socketPath: string };

const bodyLimit = 64 * 1024;

const readBody = async (request: import('node:http').IncomingMessage) => {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > bodyLimit) throw new XAutoError('INVALID_ARGUMENT', '请求体超过 64 KiB');
  }
  try {
    return JSON.parse(body || '{}') as Record<string, unknown>;
  } catch {
    throw new XAutoError('INVALID_ARGUMENT', '请求体必须是 JSON');
  }
};

const writeJson = (response: import('node:http').ServerResponse, status: number, payload: Record<string, unknown>) => {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
};

const socketIsActive = (socketPath: string) => new Promise<boolean>((resolvePromise) => {
  const socket = createConnection(socketPath);
  socket.once('connect', () => { socket.destroy(); resolvePromise(true); });
  socket.once('error', () => resolvePromise(false));
});

export const startServer = async ({ profileId, profilePath, handle, socketPath }: ServerOptions) => {
  const selectedProfile = requireSelectedProfile({ profileId, profilePath });
  const selection = { profileId, profilePath };
  let queue = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>) => {
    const next = queue.then(task);
    queue = next.then(() => undefined, () => undefined);
    return next;
  };

  const server = createServer(async (request, response) => {
    const path = request.url?.split('?')[0] || '';
    if (request.method === 'GET' && path === '/ready') {
      writeJson(response, 200, { success: true, service: 'x-auto', profile: selectedProfile.id, profilePath: selectedProfile.profilePath });
      return;
    }
    if (request.method !== 'POST') {
      writeJson(response, 404, { success: false, error: { code: 'NOT_FOUND', message: 'not found', retryable: false } });
      return;
    }

    const action = path.replace(/^\//, '');
    try {
      const payload = await readBody(request);
      const result = await enqueue(async () => {
        const base = { ...selection, handle, headed: false };
        if (action === 'check') {
          const profile = await requireAvailableSelectedProfile(selection);
          return checkSession(profile.profilePath, handle, true);
        }
        if (action === 'post') return post({ ...base, text: String(payload.text ?? '') });
        if (action === 'thread') {
          if (!Array.isArray(payload.posts) || !payload.posts.every((value) => typeof value === 'string')) throw new XAutoError('THREAD_INVALID', 'thread.posts 必须是字符串数组');
          return threadPosts({ ...base, texts: payload.posts as string[] });
        }
        const tweet = String(payload.tweet ?? '');
        if (action === 'retweet') return retweet({ ...base, tweet });
        if (action === 'like') return like({ ...base, tweet });
        if (action === 'quote') return quote({ ...base, tweet, text: String(payload.text ?? '') });
        if (action === 'comment') return comment({ ...base, tweet, text: String(payload.text ?? '') });
        throw new XAutoError('INVALID_ARGUMENT', `未知操作：${action}`);
      });
      const data = result as Record<string, unknown>;
      await recordAction(selectedProfile.id, action, { success: true, data });
      writeJson(response, 200, { success: true, action, ...data });
    } catch (error) {
      await recordAction(selectedProfile.id, action, { success: false, error }).catch(() => undefined);
      const serialized = serializeError(error);
      writeJson(response, serialized.code === 'INTERNAL_ERROR' ? 500 : 422, { success: false, action, error: serialized });
    }
  });

  await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
  if (await socketIsActive(socketPath)) throw new XAutoError('PROFILE_IN_USE', `Unix socket 已被服务占用：${socketPath}`);
  await unlink(socketPath).catch(() => undefined);
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolvePromise);
  });
  await chmod(socketPath, 0o600);
  server.on('close', () => { void unlink(socketPath).catch(() => undefined); });
  return server;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const profileId = process.env.X_AUTO_PROFILE || '';
  const profilePath = process.env.X_AUTO_PROFILE_PATH || '';
  const handle = process.env.X_AUTO_HANDLE || '';
  const socketPath = resolve(process.env.X_AUTO_SOCKET || `${process.env.HOME}/.x-auto/state/publisher.sock`);
  if ((!profileId && !profilePath) || !handle) throw new XAutoError('INVALID_ARGUMENT', 'serve requires X_AUTO_PROFILE or X_AUTO_PROFILE_PATH, plus X_AUTO_HANDLE');
  const server = await startServer({ profileId: profileId || undefined, profilePath: profilePath || undefined, handle, socketPath });
  console.log(`x-auto listening on ${socketPath}`);
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
