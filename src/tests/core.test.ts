import assert from 'node:assert/strict';
import test from 'node:test';

import { XAutoError } from '../core/errors.js';
import { countCharacters, checkText, maxPostCharacters } from '../core/text.js';
import { normalizeHandle, normalizeProfileId } from '../core/profiles.js';

test('counts Unicode code points', () => assert.equal(countCharacters('中文ab'), 4));
test('accepts valid text', () => assert.equal(checkText(' hello ').text, 'hello'));
test('uses the X weighted URL length', () => assert.equal(checkText('hello https://example.com').weightedLength, 29));
test('rejects text over limit', () => assert.throws(() => checkText('x'.repeat(maxPostCharacters + 1)), XAutoError));
test('normalizes handles and profiles', () => {
  assert.equal(normalizeHandle('@RebaseCommunity'), 'rebasecommunity');
  assert.equal(normalizeProfileId('Project_A'), 'project_a');
});
