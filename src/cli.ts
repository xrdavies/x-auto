#!/usr/bin/env node

import { checkSession } from './browser/session.js';
import { openNormalChromeLogin } from './browser/chrome.js';
import { writeFailure, writeSuccess } from './core/output.js';
import { checkText } from './core/text.js';
import { backupSelectedProfile, createSelectedProfile, requireAvailableSelectedProfile, selectedProfileStatus, type ProfileSelection } from './core/profiles.js';
import { XAutoError } from './core/errors.js';
import { post } from './actions/post.js';
import { readThreadFile, thread } from './actions/thread.js';
import { comment, like, quote, retweet } from './actions/interactions.js';
import { parseTweetTarget } from './core/targets.js';
import { defaultRemoteHost } from './remote/ssh.js';
import { remoteAction, remoteCheck, remoteDeploy, remoteInstall, remoteLoginStart, remoteLoginStatus, remoteLoginStop, remoteServiceAction, remoteServiceInstall, remoteThreadAction } from './remote/commands.js';
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

const profileSelection = (positionalProfile?: string): ProfileSelection => {
  const profileId = value('--profile') || positionalProfile;
  const profilePath = value('--profile-path');
  if (Boolean(profileId) === Boolean(profilePath)) throw new XAutoError('INVALID_ARGUMENT', '--profile 与 --profile-path 必须且只能指定一个');
  return { profileId, profilePath };
};

const main = async () => {
  if (group === 'profile' && command === 'create') {
    writeSuccess(action, createSelectedProfile(profileSelection(resource)), { json });
    return;
  }
  if (group === 'profile' && command === 'login') {
    const selection = profileSelection(resource);
    createSelectedProfile(selection);
    const profile = await requireAvailableSelectedProfile(selection);
    await openNormalChromeLogin(profile.profilePath);
    writeSuccess(action, { profile: profile.id, message: 'Chrome 已打开，请人工登录并正常关闭窗口' }, { json });
    return;
  }
  if (group === 'profile' && command === 'check') {
    const handle = value('--handle');
    if (!handle) throw new XAutoError('INVALID_ARGUMENT', 'profile check 需要 --handle');
    const profile = await requireAvailableSelectedProfile(profileSelection(resource));
    writeSuccess(action, await checkSession(profile.profilePath, handle, !argv.includes('--headed')), { json });
    return;
  }
  if (group === 'profile' && command === 'status') {
    writeSuccess(action, await selectedProfileStatus(profileSelection(resource)), { json });
    return;
  }
  if (group === 'profile' && command === 'backup') {
    writeSuccess(action, await backupSelectedProfile(profileSelection(resource)), { json });
    return;
  }
  if (group === 'text' && command === 'check') {
    const text = value('--text');
    if (text === undefined) throw new XAutoError('INVALID_ARGUMENT', 'text check 需要 --text');
    writeSuccess(action, checkText(text), { json });
    return;
  }
  if (group === 'post') {
    const selection = profileSelection();
    const handle = value('--handle');
    const text = value('--text');
    if (!handle || text === undefined) throw new XAutoError('INVALID_ARGUMENT', 'post 需要 Profile、--handle 和 --text');
    if (argv.includes('--dry-run')) {
      writeSuccess(action, { dryRun: true, ...checkText(text) }, { json });
      return;
    }
    writeSuccess(action, await post({ ...selection, handle, text, headed: argv.includes('--headed') }), { json });
    return;
  }
  if (group === 'thread') {
    const selection = profileSelection();
    const handle = value('--handle');
    const file = value('--file');
    if (!handle || !file) throw new XAutoError('INVALID_ARGUMENT', 'thread 需要 Profile、--handle 和 --file');
    if (argv.includes('--dry-run')) {
      const posts = await readThreadFile(file);
      writeSuccess(action, { dryRun: true, posts: posts.map(({ text: _text, ...result }) => result) }, { json });
      return;
    }
    writeSuccess(action, await thread({ ...selection, handle, file, headed: argv.includes('--headed') }), { json });
    return;
  }
  if (['like', 'retweet', 'comment', 'quote'].includes(group || '')) {
    const selection = profileSelection();
    const handle = value('--handle');
    const tweet = value('--tweet');
    const text = value('--text');
    if (!handle || !tweet) throw new XAutoError('INVALID_ARGUMENT', `${group} 需要 Profile、--handle 和 --tweet`);
    if ((group === 'comment' || group === 'quote') && text === undefined) throw new XAutoError('INVALID_ARGUMENT', `${group} 需要 --text`);
    if (argv.includes('--dry-run')) {
      writeSuccess(action, { dryRun: true, target: parseTweetTarget(tweet), ...((group === 'comment' || group === 'quote') ? checkText(text || '') : {}) }, { json });
      return;
    }
    const options = { ...selection, handle, tweet, headed: argv.includes('--headed') };
    const result = group === 'like' ? await like(options)
      : group === 'retweet' ? await retweet(options)
        : group === 'comment' ? await comment({ ...options, text: text || '' })
          : await quote({ ...options, text: text || '' });
    writeSuccess(action, result, { json });
    return;
  }
  if (group === 'serve') {
    const selection = profileSelection();
    const handle = value('--handle');
    if (!handle) throw new XAutoError('INVALID_ARGUMENT', 'serve 需要 Profile 和 --handle');
    const selected = await requireAvailableSelectedProfile(selection);
    const socketPath = value('--socket') || `${paths.state()}/${selected.id}.sock`;
    const server = await startServer({ ...selection, handle, socketPath });
    writeSuccess(action, { profile: selected.id, profilePath: selected.profilePath, socketPath }, { json });
    const shutdown = () => server.close(() => process.exit(0));
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    await new Promise(() => undefined);
    return;
  }
  if (group === 'remote') {
    const host = value('--host') || defaultRemoteHost;
    if (!host) throw new XAutoError('INVALID_ARGUMENT', 'remote 命令需要 --host 或 X_AUTO_REMOTE_HOST');
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
      const output = command === 'thread'
        ? await remoteThreadAction(host, forwarded, value('--file') || '')
        : await remoteAction(host, forwarded);
      process.stdout.write(`${output}\n`);
    } else throw new XAutoError('INVALID_ARGUMENT', '未知 remote 命令');
    return;
  }
  process.stdout.write('Usage: x-auto profile <create|login|check|status|backup> | text check | post | thread | retweet | quote | like | comment | serve | remote <command>\n');
};

main().catch((error) => writeFailure(action, error, { json }));
