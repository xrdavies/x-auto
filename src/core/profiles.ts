import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';

import { XAutoError } from './errors.js';
import { paths } from './paths.js';

const execFileAsync = promisify(execFile);

export type ProfileSelection = { profileId?: string; profilePath?: string };

export const normalizeProfileId = (value: string) => {
  const id = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw new XAutoError('INVALID_ARGUMENT', 'Profile ID 只能包含字母、数字、下划线和连字符');
  return id;
};

export const normalizeHandle = (value: string) => {
  const handle = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) throw new XAutoError('INVALID_ARGUMENT', 'X handle 必须是 1-15 位字母、数字或下划线');
  return handle;
};

export const createProfile = (profileId: string) => {
  const id = normalizeProfileId(profileId);
  const profilePath = paths.profile(id);
  mkdirSync(profilePath, { recursive: true, mode: 0o700 });
  return { id, profilePath };
};

const explicitProfile = (value: string, create: boolean) => {
  if (!isAbsolute(value)) throw new XAutoError('INVALID_ARGUMENT', '--profile-path 必须是绝对路径');
  const profilePath = resolve(value);
  if (create) mkdirSync(profilePath, { recursive: true, mode: 0o700 });
  if (!existsSync(profilePath)) throw new XAutoError('PROFILE_NOT_FOUND', `Profile 路径不存在：${profilePath}`);
  const id = `path-${createHash('sha256').update(profilePath).digest('hex').slice(0, 12)}`;
  return { id, profilePath, managed: false };
};

const assertSelection = ({ profileId, profilePath }: ProfileSelection) => {
  if (Boolean(profileId) === Boolean(profilePath)) throw new XAutoError('INVALID_ARGUMENT', '--profile 与 --profile-path 必须且只能指定一个');
};

export const createSelectedProfile = (selection: ProfileSelection) => {
  assertSelection(selection);
  return selection.profilePath ? explicitProfile(selection.profilePath, true) : { ...createProfile(selection.profileId || ''), managed: true };
};

export const requireSelectedProfile = (selection: ProfileSelection) => {
  assertSelection(selection);
  return selection.profilePath ? explicitProfile(selection.profilePath, false) : { ...requireProfile(selection.profileId || ''), managed: true };
};

export const requireProfile = (profileId: string) => {
  const id = normalizeProfileId(profileId);
  const profilePath = paths.profile(id);
  if (!existsSync(profilePath)) throw new XAutoError('PROFILE_NOT_FOUND', `Profile 不存在：${id}`);
  return { id, profilePath };
};

export const isProfileInUse = async (profilePath: string) => {
  const { stdout } = await execFileAsync('ps', ['ax', '-o', 'command=']);
  return stdout.split('\n').some((command) => command.includes(`--user-data-dir=${profilePath}`));
};

export const requireAvailableProfile = async (profileId: string) => {
  const profile = requireProfile(profileId);
  if (await isProfileInUse(profile.profilePath)) throw new XAutoError('PROFILE_IN_USE', `Profile 正被 Chrome 使用：${profile.id}`);
  return profile;
};

export const requireAvailableSelectedProfile = async (selection: ProfileSelection) => {
  const profile = requireSelectedProfile(selection);
  if (await isProfileInUse(profile.profilePath)) throw new XAutoError('PROFILE_IN_USE', `Profile 正被 Chrome 使用：${profile.profilePath}`);
  return profile;
};

const backupTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export const backupProfile = async (profileId: string) => {
  const profile = await requireAvailableProfile(profileId);
  const backupPath = `${paths.backups()}/${profile.id}-${backupTimestamp()}`;
  await mkdir(paths.backups(), { recursive: true, mode: 0o700 });
  await cp(profile.profilePath, backupPath, { recursive: true, force: false, errorOnExist: true });
  return { profile: profile.id, backupPath };
};

export const profileStatus = async (profileId: string) => {
  const profile = requireProfile(profileId);
  return { profile: profile.id, profilePath: profile.profilePath, inUse: await isProfileInUse(profile.profilePath) };
};

export const backupSelectedProfile = async (selection: ProfileSelection) => {
  const profile = await requireAvailableSelectedProfile(selection);
  const backupPath = `${paths.backups()}/${profile.id}-${backupTimestamp()}`;
  await mkdir(paths.backups(), { recursive: true, mode: 0o700 });
  await cp(profile.profilePath, backupPath, { recursive: true, force: false, errorOnExist: true });
  return { profile: profile.id, profilePath: profile.profilePath, backupPath };
};

export const selectedProfileStatus = async (selection: ProfileSelection) => {
  const profile = requireSelectedProfile(selection);
  return { profile: profile.id, profilePath: profile.profilePath, managed: profile.managed, inUse: await isProfileInUse(profile.profilePath) };
};
