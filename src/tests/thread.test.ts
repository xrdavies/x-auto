import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readThreadFile } from '../actions/thread.js';
import { XAutoError } from '../core/errors.js';

test('validates every thread post before browser launch', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x-auto-thread-'));
  const file = join(directory, 'thread.jsonl');
  await writeFile(file, '{"text":"first"}\n{"text":"second"}\n');
  const posts = await readThreadFile(file);
  assert.deepEqual(posts.map((post) => post.text), ['first', 'second']);
});

test('requires at least two thread posts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'x-auto-thread-'));
  const file = join(directory, 'thread.jsonl');
  await writeFile(file, '{"text":"only"}\n');
  await assert.rejects(readThreadFile(file), XAutoError);
});
