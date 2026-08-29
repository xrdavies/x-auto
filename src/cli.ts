#!/usr/bin/env node

import { checkSession } from './browser/session.js';
import { openNormalChromeLogin } from './browser/chrome.js';
import { writeFailure, writeSuccess } from './core/output.js';
import { checkText } from './core/text.js';
import { backupProfile, createProfile, profileStatus, requireAvailableProfile } from './core/profiles.js';
import { XAutoError } from './core/errors.js';
import { post } from './actions/post.js';
import { readThreadFile, thread } from './actions/thread.js';
import { comment, like, quote, retweet } from './actions/interactions.js';
import { parseTweetTarget } from './core/targets.js';
import { defaultRemoteHost } from './remote/ssh.js';
import { remoteAction, remoteCheck, remoteDeploy, remoteInstall, remoteLoginStart, remoteLoginStatus, remoteLoginStop, remoteServiceAction, remoteServiceInstall } from './remote/commands.js';
import { startServer } from './server.js';
import { paths } from './core/paths.js';

const argv = process.argv.slice(2);
const json = argv.includes('--json');
const value = (name: string) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const positional: string[] = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  if (arg === '--' || arg === '--json' || arg === '--headed' || arg === '--dry-run') continue;
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
  if (group === 'post') {
    const profileId = value('--profile');
    const handle = value('--handle');
    const text = value('--text');
    if (!profileId || !handle || text === undefined) throw new XAutoError('INVALID_ARGUMENT', 'post 需要 --profile、--handle 和 --text');
    if (argv.includes('--dry-run')) {
      writeSuccess(action, { dryRun: true, ...checkText(text) }, { json });
      return;
    }
    writeSuccess(action, await post({ profileId, handle, text, headed: argv.includes('--headed') }), { json });
    return;
  }
  if (group === 'thread') {
    const profileId = value('--profile');
    const handle = value('--handle');
    const file = value('--file');
    if (!profileId || !handle || !file) throw new XAutoError('INVALID_ARGUMENT', 'thread 需要 --profile、--handle 和 --file');
    if (argv.includes('--dry-run')) {
      const posts = await readThreadFile(file);
      writeSuccess(action, { dryRun: true, posts: posts.map(({ text: _text, ...result }) => result) }, { json });
      return;
    }
    writeSuccess(action, await thread({ profileId, handle, file, headed: argv.includes('--headed') }), { json });
    return;
  }
  if (['like', 'retweet', 'comment', 'quote'].includes(group || '')) {
    const profileId = value('--profile');
    const handle = value('--handle');
    const tweet = value('--tweet');
    const text = value('--text');
    if (!profileId || !handle || !tweet) throw new XAutoError('INVALID_ARGUMENT', `${group} 需要 --profile、--handle 和 --tweet`);
    if ((group === 'comment' || group === 'quote') && text === undefined) throw new XAutoError('INVALID_ARGUMENT', `${group} 需要 --text`);
    if (argv.includes('--dry-run')) {
      writeSuccess(action, { dryRun: true, target: parseTweetTarget(tweet), ...((group === 'comment' || group === 'quote') ? checkText(text || '') : {}) }, { json });
      return;
    }
    const options = { profileId, handle, tweet, headed: argv.includes('--headed') };
    const result = group === 'like' ? await like(options)
      : group === 'retweet' ? await retweet(options)
        : group === 'comment' ? await comment({ ...options, text: text || '' })
          : await quote({ ...options, text: text || '' });
    writeSuccess(action, result, { json });
    return;
  }
  if (group === 'serve') {
    const profileId = value('--profile');
    const handle = value('--handle');
    if (!profileId || !handle) throw new XAutoError('INVALID_ARGUMENT', 'serve 需要 --profile 和 --handle');
    const socketPath = value('--socket') || `${paths.state()}/${profileId}.sock`;
    const server = await startServer({ profileId, handle, socketPath });
    writeSuccess(action, { profile: profileId, socketPath }, { json });
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await new Promise(() => undefined);
    return;
  }
  if (group === 'remote') {
    const host = value('--host') || defaultRemoteHost;
    if (command === 'check') writeSuccess(action, { host, output: await remoteCheck(host) }, { json });
    else if (command === 'install') {
      await remoteInstall(host);
      writeSuccess(action, { host, installed: true }, { json });
    } else if (command === 'deploy') {
      await remoteDeploy(host);
      writeSuccess(action, { host, deployed: true }, { json });
    } else if (['login-start', 'login-stop', 'status'].includes(command || '')) {
      const profileId = value('--profile');
      if (!profileId) throw new XAutoError('INVALID_ARGUMENT', `remote ${command} 需要 --profile`);
      const output = command === 'login-start' ? await remoteLoginStart(host, profileId)
        : command === 'login-stop' ? await remoteLoginStop(host, profileId)
          : await remoteLoginStatus(host, profileId);
      writeSuccess(action, { host, profile: profileId, output }, { json });
    } else if (command === 'service-install') {
      const profileId = value('--profile');
      const handle = value('--handle');
      if (!profileId || !handle) throw new XAutoError('INVALID_ARGUMENT', 'remote service-install 需要 --profile 和 --handle');
      writeSuccess(action, { host, profile: profileId, output: await remoteServiceInstall(host, profileId, handle) }, { json });
    } else if (['service-start', 'service-stop', 'service-status'].includes(command || '')) {
      const profileId = value('--profile');
      if (!profileId) throw new XAutoError('INVALID_ARGUMENT', `remote ${command} 需要 --profile`);
      writeSuccess(action, { host, profile: profileId, output: await remoteServiceAction(host, profileId, command.replace('service-', '')) }, { json });
    } else if (['post', 'thread', 'retweet', 'quote', 'like', 'comment', 'profile-check'].includes(command || '')) {
      const forwarded: string[] = [command === 'profile-check' ? 'profile' : command || ''];
      if (command === 'profile-check') forwarded.push('check');
      let skippedRemote = false;
      let skippedCommand = false;
      for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--') continue;
        if (!skippedRemote && arg === 'remote') { skippedRemote = true; continue; }
        if (!skippedCommand && arg === command) { skippedCommand = true; continue; }
        if (arg === '--host') { index += 1; continue; }
        forwarded.push(arg);
      }
      const output = await remoteAction(host, forwarded);
      process.stdout.write(`${output}\n`);
    } else throw new XAutoError('INVALID_ARGUMENT', '未知 remote 命令');
    return;
  }
  process.stdout.write('Usage: x-auto profile <create|login|check|status|backup> | text check | post | thread | retweet | quote | like | comment | serve | remote <command>\n');
};

main().catch((error) => writeFailure(action, error, { json }));
