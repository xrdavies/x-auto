import { readFile } from 'node:fs/promises';

import { XAutoError } from '../core/errors.js';
import { normalizeProfileId } from '../core/profiles.js';
import { defaultRemoteHost, deploy, remoteDir, remoteNodeDir, remoteNpmCurrentDir, removeRemoteFile, shellQuote, ssh, sshWithInput, startTunnel, stopTunnel, uploadThreadFile } from './ssh.js';

export type RemoteSource = 'source' | 'npm';

export const normalizeRemoteSource = (value?: string): RemoteSource => {
  const source = value || 'source';
  if (source !== 'source' && source !== 'npm') throw new XAutoError('INVALID_ARGUMENT', '--source 必须是 source 或 npm');
  return source;
};

export const normalizePackageVersion = (value: string) => {
  const version = value.trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new XAutoError('INVALID_ARGUMENT', '--version 必须是明确的 npm 版本，例如 0.1.0');
  }
  return version;
};

const runtimeDir = (source: RemoteSource) => source === 'npm' ? remoteNpmCurrentDir : remoteDir;

const runtimeGuard = (source: RemoteSource) => source === 'npm'
  ? `test -f ${remoteNpmCurrentDir}/dist/cli.js || { echo 'npm 版本未安装，请先执行 remote package-install' >&2; exit 1; };`
  : '';

export const remoteCheck = async (host = defaultRemoteHost) => {
  const { stdout } = await ssh(host, 'set -e; . /etc/os-release; printf "os=%s %s\\narch=%s\\nuser=%s\\n" "$ID" "$VERSION_ID" "$(uname -m)" "$(whoami)"; for cmd in google-chrome-stable Xvfb x11vnc xdpyinfo curl rsync openssl; do command -v "$cmd" >/dev/null && echo "$cmd=ok" || echo "$cmd=missing"; done; if [ -x "$HOME/.local/node-v24.15.0-linux-x64/bin/node" ]; then "$HOME/.local/node-v24.15.0-linux-x64/bin/node" -v; else echo node24=missing; fi');
  return stdout.trim();
};

export const remoteInstall = async (host = defaultRemoteHost) => {
  const script = await readFile(new URL('../../scripts/remote-install.sh', import.meta.url), 'utf8');
  await sshWithInput(host, 'bash -s', script);
};

export const remoteDeploy = (host = defaultRemoteHost) => deploy(host);

export const remotePackageInstall = async (host: string, version: string) => {
  const normalizedVersion = normalizePackageVersion(version);
  const command = [
    `export PATH=${remoteNodeDir}:$PATH`,
    'set -e',
    'install_root="$HOME/.local/x-auto"',
    `release_dir="$install_root/releases/${normalizedVersion}"`,
    'package_dir="$release_dir/node_modules/@xrdavies/x-auto"',
    'mkdir -p "$install_root/releases"',
    'if [ ! -f "$package_dir/package.json" ]; then',
    '  mkdir -p "$release_dir"',
    `  npm install --prefix "$release_dir" --omit=dev --no-audit --no-fund ${shellQuote(`@xrdavies/x-auto@${normalizedVersion}`)}`,
    'fi',
    'test -f "$package_dir/dist/server.js"',
    'if [ -e "$install_root/current" ] && [ ! -L "$install_root/current" ]; then echo "当前 npm 版本路径不是符号链接，停止切换" >&2; exit 1; fi',
    'ln -sfn "$package_dir" "$install_root/current"',
    `printf 'version=%s\\npackage_dir=%s\\ncurrent=%s\\n' ${shellQuote(normalizedVersion)} "$package_dir" "$install_root/current"`,
  ].join('\n');
  return (await ssh(host, command)).stdout.trim();
};

const loginCommand = (action: string, profileId: string, source: RemoteSource) => `cd ${runtimeDir(source)}; bash scripts/remote-login-session.sh ${shellQuote(action)} ${shellQuote(normalizeProfileId(profileId))}`;

export const remoteLoginStart = async (host: string, profileId: string, source: RemoteSource = 'source') => {
  const { stdout } = await ssh(host, `${runtimeGuard(source)} ${loginCommand('start', profileId, source)}`);
  const port = Number(stdout.match(/^VNC_PORT=(\d+)$/m)?.[1]);
  if (!port) throw new Error(`remote login did not return a VNC port:\n${stdout}`);
  try {
    await startTunnel(host, port);
  } catch (error) {
    await ssh(host, loginCommand('stop', profileId, source)).catch(() => undefined);
    throw error;
  }
  return stdout.trim();
};

export const remoteLoginStop = async (host: string, profileId: string, source: RemoteSource = 'source') => {
  try {
    const { stdout } = await ssh(host, `${runtimeGuard(source)} ${loginCommand('stop', profileId, source)}`);
    return stdout.trim();
  } finally {
    await stopTunnel(host);
  }
};

export const remoteLoginStatus = async (host: string, profileId: string, source: RemoteSource = 'source') => (await ssh(host, `${runtimeGuard(source)} ${loginCommand('status', profileId, source)}`)).stdout.trim();

export const remoteAction = async (host: string, args: string[], source: RemoteSource = 'source') => {
  const command = `export PATH=${remoteNodeDir}:$PATH; export CHROME_PATH=/usr/bin/google-chrome-stable; ${runtimeGuard(source)} cd ${runtimeDir(source)}; node dist/cli.js ${args.map(shellQuote).join(' ')}`;
  return (await ssh(host, command)).stdout.trim();
};

export const remoteThreadAction = async (host: string, args: string[], localFile: string, source: RemoteSource = 'source') => {
  const forwarded = [...args];
  const fileIndex = forwarded.indexOf('--file');
  if (fileIndex < 0) throw new Error('remote thread requires --file');
  const remoteFile = await uploadThreadFile(host, localFile);
  forwarded[fileIndex + 1] = remoteFile;
  try {
    return await remoteAction(host, forwarded, source);
  } finally {
    await removeRemoteFile(host, remoteFile).catch(() => undefined);
  }
};

export const remoteServiceInstall = async (host: string, profileId: string, handle: string, source: RemoteSource = 'source') => {
  const command = `${runtimeGuard(source)} cd ${runtimeDir(source)}; bash scripts/install-user-service.sh ${shellQuote(normalizeProfileId(profileId))} ${shellQuote(handle)} ${shellQuote(source)}`;
  return (await ssh(host, command)).stdout.trim();
};

export const remoteServiceAction = async (host: string, profileId: string, action: string) => {
  const id = normalizeProfileId(profileId);
  const unit = `x-auto@${id}.service`;
  const command = action === 'status'
    ? `systemctl --user show ${shellQuote(unit)} -p LoadState -p ActiveState -p SubState -p MainPID`
    : `systemctl --user ${action} ${shellQuote(unit)}`;
  return (await ssh(host, command)).stdout.trim();
};
