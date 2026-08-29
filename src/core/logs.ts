import { appendFile, mkdir } from 'node:fs/promises';

import { serializeError } from './errors.js';
import { paths } from './paths.js';

export const recordAction = async (profileId: string, action: string, result: { success: true; data: Record<string, unknown> } | { success: false; error: unknown }) => {
  await mkdir(paths.state(), { recursive: true, mode: 0o700 });
  const event = result.success
    ? { timestamp: new Date().toISOString(), profile: profileId, action, success: true, result: result.data }
    : { timestamp: new Date().toISOString(), profile: profileId, action, success: false, error: serializeError(result.error) };
  await appendFile(`${paths.state()}/${profileId}-actions.jsonl`, `${JSON.stringify(event)}\n`, { mode: 0o600 });
};
