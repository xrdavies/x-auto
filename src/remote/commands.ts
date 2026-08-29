import { readFile } from 'node:fs/promises';

import { normalizeProfileId } from '../core/profiles.js';
import { defaultRemoteHost, deploy, remoteDir, remoteNodeDir, removeRemoteFile, shellQuote, ssh, sshWithInput, startTunnel, stopTunnel, uploadThreadFile } from './ssh.js';

export const remoteCheck = async (host = defaultRemoteHost) => {
  const { stdout } = await ssh(host, 'set -e; . /etc/os-release; printf "os=%s %s\\narch=%s\\nuser=%s\\n" "$ID" "$VERSION_ID" "$(uname -m)" "$(whoami)"; for cmd in google-chrome-stable Xvfb x11vnc xdpyinfo curl rsync openssl; do command -v "$cmd" >/dev/null && echo "$cmd=ok" || echo "$cmd=missing"; done; if [ -x "$HOME/.local/node-v24.15.0-linux-x64/bin/node" ]; then "$HOME/.local/node-v24.15.0-linux-x64/bin/node" -v; else echo node24=missing; fi');
  return stdout.trim();
};

export const remoteInstall = async (host = defaultRemoteHost) => {
  const script = await readFile(new URL('../../scripts/remote-install.sh', import.meta.url), 'utf8');
  await sshWithInput(host, 'bash -s', script);
};

export const remoteDeploy = (host = defaultRemoteHost) => deploy(host);

const loginCommand = (action: string, profileId: string) => `cd ${remoteDir}; bash scripts/remote-login-session.sh ${shellQuote(action)} ${shellQuote(normalizeProfileId(profileId))}`;

export const remoteLoginStart = async (host: string, profileId: string) => {
  const { stdout } = await ssh(host, loginCommand('start', profileId));
  const port = Number(stdout.match(/^VNC_PORT=(\d+)$/m)?.[1]);
  if (!port) throw new Error(`remote login did not return a VNC port:\n${stdout}`);
  try {
    await startTunnel(host, port);
  } catch (error) {
    await ssh(host, loginCommand('stop', profileId)).catch(() => undefined);
    throw error;
  }
  return stdout.trim();
};

export const remoteLoginStop = async (host: string, profileId: string) => {
  try {
    const { stdout } = await ssh(host, loginCommand('stop', profileId));
    return stdout.trim();
  } finally {
    await stopTunnel(host);
  }
};

export const remoteLoginStatus = async (host: string, profileId: string) => (await ssh(host, loginCommand('status', profileId))).stdout.trim();

export const remoteAction = async (host: string, args: string[]) => {
  const command = `export PATH=${remoteNodeDir}:$PATH; export CHROME_PATH=/usr/bin/google-chrome-stable; cd ${remoteDir}; node dist/cli.js ${args.map(shellQuote).join(' ')}`;
  return (await ssh(host, command)).stdout.trim();
};

export const remoteThreadAction = async (host: string, args: string[], localFile: string) => {
  const forwarded = [...args];
  const fileIndex = forwarded.indexOf('--file');
  if (fileIndex < 0) throw new Error('remote thread requires --file');
  const remoteFile = await uploadThreadFile(host, localFile);
  forwarded[fileIndex + 1] = remoteFile;
  try {
    return await remoteAction(host, forwarded);
  } finally {
    await removeRemoteFile(host, remoteFile).catch(() => undefined);
  }
};

export const remoteServiceInstall = async (host: string, profileId: string, handle: string) => {
  const command = `cd ${remoteDir}; bash scripts/install-user-service.sh ${shellQuote(normalizeProfileId(profileId))} ${shellQuote(handle)}`;
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
