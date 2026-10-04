import assert from 'node:assert/strict';
import test from 'node:test';

import { parseArgs } from '../core/args.js';
import { remoteNodeVersion } from '../remote/ssh.js';
import { statusForError } from '../server.js';

test('parses flags, values and positionals', () => {
  const args = parseArgs(['--', 'post', '--profile', 'main', '--text', 'hello', '--dry-run']);
  assert.deepEqual(args.positional, ['post']);
  assert.equal(args.value('--text'), 'hello');
  assert.equal(args.has('--dry-run'), true);
  assert.deepEqual(args.errors, []);
});

test('rejects unknown, missing and duplicate flags', () => {
  assert.match(parseArgs(['post', '--txet', 'x']).errors.join(), /未知参数：--txet/);
  assert.match(parseArgs(['post', '--text']).errors.join(), /--text 需要一个值/);
  assert.match(parseArgs(['post', '--text', '--json']).errors.join(), /--text 需要一个值/);
  assert.match(parseArgs(['post', '--text', 'a', '--text', 'b']).errors.join(), /参数重复：--text/);
});

test('maps error codes to HTTP status', () => {
  assert.equal(statusForError('TEXT_TOO_LONG'), 422);
  assert.equal(statusForError('PROFILE_IN_USE'), 409);
  assert.equal(statusForError('SESSION_NOT_AUTHENTICATED'), 503);
  assert.equal(statusForError('PUBLISH_UNKNOWN'), 502);
  assert.equal(statusForError('INTERNAL_ERROR'), 500);
});

test('validates the remote Node version', () => {
  const previous = process.env.X_AUTO_REMOTE_NODE_VERSION;
  try {
    delete process.env.X_AUTO_REMOTE_NODE_VERSION;
    assert.equal(remoteNodeVersion(), '24.15.0');
    process.env.X_AUTO_REMOTE_NODE_VERSION = '24.16.1';
    assert.equal(remoteNodeVersion(), '24.16.1');
    process.env.X_AUTO_REMOTE_NODE_VERSION = '24.1; rm -rf ~';
    assert.throws(() => remoteNodeVersion());
  } finally {
    if (previous === undefined) delete process.env.X_AUTO_REMOTE_NODE_VERSION;
    else process.env.X_AUTO_REMOTE_NODE_VERSION = previous;
  }
});
