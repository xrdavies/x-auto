import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

import { Browser } from '@agent-infra/browser';

import { XAutoError } from '../core/errors.js';

const execFileAsync = promisify(execFile);

export const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const openNormalChromeLogin = async (profilePath: string) => {
  if (process.platform !== 'darwin') throw new XAutoError('INVALID_ARGUMENT', '本地登录命令仅支持 macOS');
  if (!existsSync(macChromePath)) throw new XAutoError('BROWSER_LAUNCH_FAILED', '未找到 Google Chrome');
  await execFileAsync('open', ['-na', macChromePath, '--args', `--user-data-dir=${profilePath}`, 'https://x.com/i/flow/login']);
};

export const launchAutomatedChrome = async (profilePath: string, headless = true) => {
  try {
    return await Browser.create({
      launchOrConnect: {
        headless,
        userDataDir: profilePath,
        executablePath: process.env.CHROME_PATH || macChromePath,
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
        ignoreDefaultArgs: ['--enable-automation', '--password-store=basic', '--use-mock-keychain'],
      },
    });
  } catch (error) {
    throw new XAutoError('BROWSER_LAUNCH_FAILED', error instanceof Error ? error.message : String(error));
  }
};
