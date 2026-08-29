import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { XAutoClient, XAutoClientError } from '../client.js';

test('calls the Unix Socket API and exposes server errors', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x-auto-client-'));
  const socketPath = join(directory, 'publisher.sock');
  const server = createServer((request, response) => {
    if (request.url === '/ready') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ success: true, service: 'x-auto', profile: 'test', profilePath: '/tmp/profile' }));
      return;
    }
    response.writeHead(422, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ success: false, error: { code: 'TEXT_TOO_LONG', message: '内容过长', retryable: false } }));
  });
  await mkdir(directory, { recursive: true });
  await new Promise<void>((resolvePromise) => server.listen(socketPath, resolvePromise));

  try {
    const client = new XAutoClient({ socketPath });
    assert.equal((await client.ready()).profile, 'test');
    await assert.rejects(() => client.post({ text: 'too long' }), (error: unknown) => {
      assert.ok(error instanceof XAutoClientError);
      assert.equal(error.code, 'TEXT_TOO_LONG');
      assert.equal(error.retryable, false);
      return true;
    });
  } finally {
    await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    await unlink(socketPath).catch(() => undefined);
  }
});
