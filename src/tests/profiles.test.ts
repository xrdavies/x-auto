import assert from 'node:assert/strict';
import test from 'node:test';

import { commandUsesProfile } from '../core/profiles.js';

test('matches the exact Chrome user data dir only', () => {
  const chrome = '/usr/bin/google-chrome --user-data-dir=/x/foo --no-first-run';
  assert.equal(commandUsesProfile(chrome, '/x/foo'), true);
  assert.equal(commandUsesProfile('chrome --user-data-dir=/x/foo', '/x/foo'), true);
  assert.equal(commandUsesProfile('chrome --user-data-dir=/x/foo2 --no-first-run', '/x/foo'), false);
  assert.equal(commandUsesProfile('chrome --user-data-dir=/x/foo/Default', '/x/foo'), false);
  assert.equal(commandUsesProfile('chrome --user-data-dir=/x/foo2 --user-data-dir=/x/foo', '/x/foo'), true);
});
