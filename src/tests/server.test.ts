import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, stat } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { startServer } from '../server.js';

const get = (socketPath: string, path: string) => new Promise<{ status: number; body: string }>((resolvePromise, reject) => {
  const req = request({ socketPath, path, method: 'GET' }, (response) => {
    let body = '';
    response.on('data', (chunk) => { body += chunk; });
    response.on('end', () => resolvePromise({ status: response.statusCode || 0, body }));
  });
  req.on('error', reject);
  req.end();
});

test('serves ready over a private Unix socket', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x-auto-server-'));
  const profilePath = join(directory, 'profile');
  const socketPath = join(directory, 'publisher.sock');
  await mkdir(profilePath);
  const server = await startServer({ profilePath, handle: 'Test', socketPath });
  try {
    const response = await get(socketPath, '/ready');
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).profilePath, profilePath);
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    await chmod(directory, 0o700);
  }
});
