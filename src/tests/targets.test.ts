import assert from 'node:assert/strict';
import test from 'node:test';

import { XAutoError } from '../core/errors.js';
import { parseTweetTarget } from '../core/targets.js';

test('parses X and Twitter targets', () => {
  assert.equal(parseTweetTarget('123').tweetId, '123');
  assert.equal(parseTweetTarget('https://x.com/user/status/456').tweetId, '456');
  assert.equal(parseTweetTarget('https://twitter.com/user/status/789?s=20').tweetId, '789');
});

test('rejects invalid targets', () => assert.throws(() => parseTweetTarget('https://example.com/1'), XAutoError));
