#!/usr/bin/env node

import { checkSession } from './browser/session.js';
import { openNormalChromeLogin } from './browser/chrome.js';
import { writeFailure, writeSuccess } from './core/output.js';
import { checkText } from './core/text.js';
import { backupProfile, createProfile, profileStatus, requireAvailableProfile } from './core/profiles.js';
import { XAutoError } from './core/errors.js';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const value = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const positional: string[] = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === '--' || arg === '--json' || arg === '--headed') continue;
  if (arg.startsWith('--')) {
    index += 1;
    continue;
  }
  positional.push(arg);
}
const [group, command, resource] = positional;
const action = [group, command].filter(Boolean).join(':') || 'help';

const main = async () => {
  if (group === 'profile' && command === 'create') {
    const profileId = value('--profile') || resource;
    if (!profileId) throw new XAutoError('INVALID_ARGUMENT', '缺少 Profile ID');
    writeSuccess(action, createProfile(profileId), { json });
    return;
  }
  if (group === 'profile' && command === 'login') {
    const profileId = value('--profile') || resource;
    if (!profileId) throw new XAutoError('INVALID_ARGUMENT', '缺少 Profile ID');
    const profile = await requireAvailableProfile(createProfile(profileId).id);
    await openNormalChromeLogin(profile.profilePath);
    writeSuccess(action, { profile: profile.id, message: 'Chrome 已打开，请人工登录并正常关闭窗口' }, { json });
    return;
  }
  if (group === 'profile' && command === 'check') {
    const profileId = value('--profile') || resource;
    const handle = value('--handle');
    if (!profileId || !handle) throw new XAutoError('INVALID_ARGUMENT', 'profile check 需要 Profile ID 和 --handle');
    const profile = await requireAvailableProfile(profileId);
    writeSuccess(action, await checkSession(profile.profilePath, handle, !argv.includes('--headed')), { json });
    return;
  }
  if (group === 'profile' && command === 'status') {
    const profileId = value('--profile') || resource;
    if (!profileId) throw new XAutoError('INVALID_ARGUMENT', '缺少 Profile ID');
    writeSuccess(action, await profileStatus(profileId), { json });
    return;
  }
  if (group === 'profile' && command === 'backup') {
    const profileId = value('--profile') || resource;
    if (!profileId) throw new XAutoError('INVALID_ARGUMENT', '缺少 Profile ID');
    writeSuccess(action, await backupProfile(profileId), { json });
    return;
  }
  if (group === 'text' && command === 'check') {
    const text = value('--text');
    if (text === undefined) throw new XAutoError('INVALID_ARGUMENT', 'text check 需要 --text');
    writeSuccess(action, checkText(text), { json });
    return;
  }
  process.stdout.write('Usage: x-auto profile <create|login|check|status|backup> | text check\n');
};

main().catch((error) => writeFailure(action, error, { json }));
